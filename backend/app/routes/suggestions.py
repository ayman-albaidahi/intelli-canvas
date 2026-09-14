from flask import Blueprint, current_app, jsonify, request, send_file

from ..api_utils import error_response
from ..services.operation_service import (
    NodeService,
    OperationParamError,
    UnknownOperationError,
)
from ..services.resource_guard import ResourceExceededError
from ..services.suggestion_service import (
    build_suggestions,
    validate_suggested_operation,
)

suggestions_bp = Blueprint(
    "suggestions",
    __name__,
    url_prefix="/api/suggestions",
)



def _node_service() -> NodeService:
    return current_app.config["NODE_SERVICE"]


def _analysis_findings(image_id: str):
    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    session = session_service.get_session(image_id)
    if session is None:
        return None, error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    from pathlib import Path

    from PIL import Image

    from ..services.analysis_service import analyze

    storage = current_app.config["FILE_STORAGE_SERVICE"]
    directory = (
        storage.processed_dir
        if session.get("current_storage") == "processed"
        else storage.uploads_dir
    )
    source_path = Path(directory) / (session.get("current_filename") or "")
    if not source_path.is_file():
        return None, error_response("IMAGE_NOT_AVAILABLE", "Stored image was not found.", 404)
    with Image.open(source_path) as image:
        report = analyze(image)
    return report, None


def _suggestion_for(image_id: str, sug_type: str):
    report, error = _analysis_findings(image_id)
    if error:
        return None, error
    for suggestion in build_suggestions(report["findings"], report["metrics"]):
        if suggestion["type"] == sug_type:
            return suggestion, None
    return None, error_response("SUGGESTION_NOT_AVAILABLE", "This suggestion is not available for the image.", 404)


@suggestions_bp.post("")
def list_suggestions():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    report, error = _analysis_findings(image_id)
    if error:
        return error
    suggestions = build_suggestions(report["findings"], report["metrics"])
    return jsonify(success=True, image_id=image_id, metrics=report["metrics"], findings=report["findings"], suggestions=suggestions)


@suggestions_bp.post("/preview")
def preview_suggestion():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    sug_type = payload.get("type")
    if not isinstance(image_id, str) or not isinstance(sug_type, str):
        return error_response("INVALID_REQUEST", "image_id and type are required.", 400)
    suggestion, error = _suggestion_for(image_id, sug_type)
    if error:
        return error
    try:
        validate_suggested_operation(suggestion)
        png_bytes = _node_service().preview_bytes(
            image_id,
            suggestion["suggested_operation"]["type"],
            suggestion["suggested_operation"]["params"],
        )
    except (OperationParamError, UnknownOperationError) as exc:
        return error_response("INVALID_OPERATION", str(exc), 400)
    except FileNotFoundError:
        return error_response("IMAGE_NOT_AVAILABLE", "Stored image was not found.", 404)
    except (OSError, ValueError):
        return error_response("PREVIEW_FAILED", "The preview could not be generated.", 400)
    import io

    return send_file(io.BytesIO(png_bytes), mimetype="image/png")


@suggestions_bp.post("/apply")
def apply_suggestion():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    sug_type = payload.get("type")
    if not isinstance(image_id, str) or not isinstance(sug_type, str):
        return error_response("INVALID_REQUEST", "image_id and type are required.", 400)
    suggestion, error = _suggestion_for(image_id, sug_type)
    if error:
        return error
    try:
        node = _node_service().apply_operation(
            image_id,
            suggestion["suggested_operation"]["type"],
            suggestion["suggested_operation"]["params"],
        )
    except (OperationParamError, UnknownOperationError) as exc:
        return error_response("INVALID_OPERATION", str(exc), 400)
    except FileNotFoundError:
        return error_response("IMAGE_NOT_AVAILABLE", "Stored image was not found.", 404)
    except ResourceExceededError as exc:
        return error_response("RESOURCE_LIMIT", str(exc), 400)
    except (OSError, ValueError):
        return error_response("APPLY_FAILED", "The suggestion could not be applied.", 400)
    return jsonify(success=True, node=node, suggestion_type=sug_type)


@suggestions_bp.post("/dismiss")
def dismiss_suggestion():
    payload = request.get_json(silent=True) or {}
    sug_type = payload.get("type")
    if not isinstance(sug_type, str) or not sug_type.strip():
        return error_response("INVALID_REQUEST", "A suggestion type is required.", 400)
    return jsonify(success=True, dismissed=True, type=sug_type)
