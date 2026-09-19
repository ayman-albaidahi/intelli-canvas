from flask import Blueprint, current_app, jsonify, request, send_file

from ..errors import error_response
from ..services.pipeline_execution_service import PipelineExecutionService
from ..services.pipeline_service import PipelineParamError, PipelineService

pipeline_bp = Blueprint("pipeline", __name__, url_prefix="/api/pipeline")


def _service() -> PipelineService:
    return PipelineService(current_app.config["IMAGE_SESSION_SERVICE"])


def _image_id(payload=None):
    payload = payload if isinstance(payload, dict) else request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if current_app.config["IMAGE_SESSION_SERVICE"].get_session(image_id) is None:
        return None, error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return image_id, None


def _response(pipeline):
    return jsonify(success=True, pipeline=pipeline)


def _execution(payload, persist):
    image_id, error = _image_id(payload)
    if error:
        return error
    try:
        pipeline = payload if isinstance(payload.get("nodes"), list) else _service().get(image_id)
        result = PipelineExecutionService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).execute(image_id, pipeline, persist=persist)
        if not persist:
            return send_file(result["path"], mimetype="image/png", max_age=0)
        return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})
    except PipelineParamError as exc:
        return error_response("INVALID_PIPELINE", str(exc), 400)
    except (FileNotFoundError, ValueError, OSError) as exc:
        return error_response("PIPELINE_EXECUTION_FAILED", str(exc), 400)


def _handle(action):
    payload = request.get_json(silent=True) or {}
    image_id, error = _image_id(payload)
    if error:
        return error
    try:
        return _response(action(image_id, payload))
    except PipelineParamError as exc:
        return error_response("INVALID_PIPELINE", str(exc), 400)
    except KeyError as exc:
        return error_response("PIPELINE_NODE_NOT_FOUND", str(exc), 404)
    except FileNotFoundError as exc:
        return error_response("IMAGE_SESSION_NOT_FOUND", str(exc), 404)


@pipeline_bp.get("")
def get_pipeline():
    image_id, error = _image_id(request.args.to_dict())
    if error:
        return error
    try:
        return _response(_service().get(image_id))
    except FileNotFoundError as exc:
        return error_response("IMAGE_SESSION_NOT_FOUND", str(exc), 404)


@pipeline_bp.put("")
def put_pipeline():
    return _handle(_service().save)


@pipeline_bp.post("/preview")
def preview_pipeline():
    return _execution(request.get_json(silent=True) or {}, persist=False)


@pipeline_bp.post("/apply")
def apply_pipeline():
    return _execution(request.get_json(silent=True) or {}, persist=True)


@pipeline_bp.post("/nodes")
def add_node():
    return _handle(_service().add)


@pipeline_bp.patch("/nodes/<node_id>")
def patch_node(node_id):
    return _handle(lambda image_id, payload: _service().patch(image_id, node_id, payload))


@pipeline_bp.delete("/nodes/<node_id>")
def delete_node(node_id):
    return _handle(lambda image_id, payload: _service().delete(image_id, node_id))


@pipeline_bp.post("/nodes/<node_id>/toggle")
def toggle_node(node_id):
    return _handle(lambda image_id, payload: _service().toggle(image_id, node_id))


@pipeline_bp.post("/reorder")
def reorder_node():
    return _handle(lambda image_id, payload: _service().reorder(image_id, payload.get("node_id"), payload.get("order")))
