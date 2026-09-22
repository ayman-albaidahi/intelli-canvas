from flask import Blueprint, jsonify, request, send_file

from ..authorization import require_owned_image
from ..dependencies import get_session_service, get_storage_service
from ..error_codes import ErrorCodes
from ..errors import error_response
from ..services.pipeline_execution_service import PipelineExecutionService
from ..services.pipeline_service import PipelineParamError, PipelineService
from ..views import public_image

pipeline_bp = Blueprint("pipeline", __name__, url_prefix="/api/pipeline")


def _service() -> PipelineService:
    return PipelineService(get_session_service())


def _image_id(payload=None):
    payload = (
        payload if isinstance(payload, dict) else request.get_json(silent=True) or {}
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


def _response(pipeline):
    return jsonify(success=True, pipeline=pipeline)


def _execution(payload, persist):
    image_id, error = _image_id(payload)
    if error:
        return error
    try:
        pipeline = (
            payload
            if isinstance(payload.get("nodes"), list)
            else _service().get(image_id)
        )
        result = PipelineExecutionService(
            get_session_service(),
            get_storage_service(),
        ).execute(image_id, pipeline, persist=persist)
        if not persist:
            return send_file(result.path, mimetype="image/png", max_age=0)
        return jsonify(success=True, image=public_image(result))
    except PipelineParamError as exc:
        return error_response(ErrorCodes.INVALID_PIPELINE, str(exc), 400)
    except (FileNotFoundError, ValueError, OSError) as exc:
        return error_response(ErrorCodes.PIPELINE_EXECUTION_FAILED, str(exc), 400)


def _handle(action):
    payload = request.get_json(silent=True) or {}
    image_id, error = _image_id(payload)
    if error:
        return error
    try:
        return _response(action(image_id, payload))
    except PipelineParamError as exc:
        return error_response(ErrorCodes.INVALID_PIPELINE, str(exc), 400)
    except KeyError as exc:
        return error_response(ErrorCodes.PIPELINE_NODE_NOT_FOUND, str(exc), 404)
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.IMAGE_SESSION_NOT_FOUND, str(exc), 404)


@pipeline_bp.get("")
@require_owned_image
def get_pipeline():
    image_id, error = _image_id(request.args.to_dict())
    if error:
        return error
    try:
        return _response(_service().get(image_id))
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.IMAGE_SESSION_NOT_FOUND, str(exc), 404)


@pipeline_bp.put("")
@require_owned_image
def put_pipeline():
    return _handle(_service().save)


@pipeline_bp.post("/preview")
@require_owned_image
def preview_pipeline():
    return _execution(request.get_json(silent=True) or {}, persist=False)


@pipeline_bp.post("/apply")
@require_owned_image
def apply_pipeline():
    return _execution(request.get_json(silent=True) or {}, persist=True)


@pipeline_bp.post("/nodes")
@require_owned_image
def add_node():
    return _handle(_service().add)


@pipeline_bp.patch("/nodes/<node_id>")
@require_owned_image
def patch_node(node_id):
    return _handle(
        lambda image_id, payload: _service().patch(image_id, node_id, payload)
    )


@pipeline_bp.delete("/nodes/<node_id>")
@require_owned_image
def delete_node(node_id):
    return _handle(lambda image_id, payload: _service().delete(image_id, node_id))


@pipeline_bp.post("/nodes/<node_id>/toggle")
@require_owned_image
def toggle_node(node_id):
    return _handle(lambda image_id, payload: _service().toggle(image_id, node_id))


@pipeline_bp.post("/reorder")
@require_owned_image
def reorder_node():
    return _handle(
        lambda image_id, payload: _service().reorder(
            image_id, payload.get("node_id"), payload.get("order")
        )
    )
