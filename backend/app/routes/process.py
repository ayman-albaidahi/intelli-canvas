from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..dependencies import get_session_service, get_storage_service
from ..error_codes import ErrorCodes
from ..errors import InvalidRequestError, error_response
from ..operations.registry import OPERATIONS
from ..services.file_service import FileValidationError
from ..services.process_service import ProcessService
from ..validation import require_dict, require_int
from ..views import public_image

process_bp = Blueprint("process", __name__, url_prefix="/api/process")


def _process_service() -> ProcessService:
    return ProcessService(
        get_session_service(),
        get_storage_service(),
    )


def _image_id_from_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, error_response(
            ErrorCodes.INVALID_REQUEST, "A JSON request body is required.", 400
        )
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response(
            ErrorCodes.INVALID_IMAGE_ID, "A valid image_id is required.", 400
        )
    if get_session_service().get_session(image_id) is None:
        return None, error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )
    return image_id, None


def _run_registered(slug: str):
    """Handle any registered image-producing operation.

    Validation runs through the registry spec, so the direct API and the
    pipeline report identical codes for the same bad parameter.
    """
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    try:
        result = _process_service().run_op(image_id, slug, payload)
    except InvalidRequestError as exc:
        return error_response(exc.code, exc.message, 400)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.PROCESSING_FAILED,
            f"The {slug} operation could not be applied.",
            400,
        )
    return jsonify(success=True, image=public_image(result))


def _register_routes() -> None:
    """Generate one POST route per registered image-producing operation.

    Historically each operation was a hand-written endpoint repeating the same
    ~15 lines. Generating them from the registry keeps the URL surface and the
    dispatch in one place: adding an operation to OPERATIONS adds its route.
    """
    for slug, operation in OPERATIONS.items():
        if not operation.produces_image:
            continue

        # A distinct function object per route keeps Flask's view registry happy.
        def view(_slug=slug):
            return _run_registered(_slug)

        view.__name__ = f"process_{slug.replace('-', '_')}"
        process_bp.add_url_rule(f"/{slug}", view_func=view, methods=["POST"])


_register_routes()


# ---- Batch and read-only endpoints ------------------------------------------
# These do not fit the single-operation shape: adjustments applies several
# operations in one pass with a nested response, and histogram answers with
# data instead of producing an image file.


@process_bp.post("/adjustments")
def apply_adjustments():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = require_dict(request.get_json(silent=True), name="request body")

    values: dict = {}
    for name, low, high in (
        ("brightness", 0, 200),
        ("contrast", 0, 200),
        ("saturation", 0, 200),
        ("blur", 0, 20),
        ("sharpen", 0, 5),
    ):
        value = payload.get(name)
        if value is None:
            continue
        values[name] = require_int(
            value, low=low, high=high, name=name, code=f"INVALID_{name.upper()}"
        )
    for flag in ("grayscale", "negative"):
        value = payload.get(flag)
        if value is None:
            continue
        if not isinstance(value, bool):
            return error_response(
                f"INVALID_{flag.upper()}", f"{flag.title()} must be a boolean.", 400
            )
        values[flag] = value

    neutral = {
        "brightness": 100,
        "contrast": 100,
        "saturation": 100,
        "blur": 0,
        "sharpen": 0,
    }
    changed = [
        key for key, value in values.items() if key in neutral and value != neutral[key]
    ]
    changed += [flag for flag in ("grayscale", "negative") if values.get(flag)]
    if not changed:
        return error_response(
            ErrorCodes.NO_ADJUSTMENTS,
            "At least one adjustment must change from its neutral value.",
            400,
        )

    try:
        result = _process_service().adjustments(image_id, values)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.ADJUSTMENTS_FAILED, "The adjustments could not be applied.", 400
        )
    return jsonify(success=True, image=public_image(result))


@process_bp.post("/histogram")
def image_histogram():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        histogram = _process_service().histogram(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response(ErrorCodes.IMAGE_NOT_AVAILABLE, str(exc), 404)
    except (OSError, ValueError):
        return error_response(
            ErrorCodes.HISTOGRAM_FAILED,
            "The image histogram could not be computed.",
            400,
        )
    return jsonify(success=True, histogram=histogram)
