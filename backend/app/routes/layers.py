import json

from flask import Blueprint, current_app, jsonify, request

from ..api_utils import error_response

layers_bp = Blueprint(
    "layers",
    __name__,
    url_prefix="/api/layers",
)

MAX_LAYERS = 100
MAX_LAYER_PAYLOAD_BYTES = 2_000_000
ALLOWED_TYPES = {"brush", "shape", "text", "image"}


def _session_service():
    return current_app.config["IMAGE_SESSION_SERVICE"]


def _validate_layers(payload):
    if not isinstance(payload, list):
        return None, error_response("INVALID_LAYERS", "layers must be an array.", 400)
    if len(payload) > MAX_LAYERS:
        return None, error_response("INVALID_LAYERS", "Too many layers.", 400)
    try:
        if len(json.dumps(payload, separators=(",", ":"))) > MAX_LAYER_PAYLOAD_BYTES:
            return None, error_response("INVALID_LAYERS", "Layer payload is too large.", 413)
    except (TypeError, ValueError):
        return None, error_response("INVALID_LAYERS", "Layer payload must be JSON serializable.", 400)

    clean = []
    for layer in payload:
        if not isinstance(layer, dict):
            return None, error_response("INVALID_LAYERS", "Each layer must be an object.", 400)
        layer_type = layer.get("type")
        if layer_type not in ALLOWED_TYPES:
            return None, error_response("INVALID_LAYERS", "Layer type is not supported.", 400)
        if not isinstance(layer.get("id"), str) or not layer["id"].strip():
            return None, error_response("INVALID_LAYERS", "Each layer needs an id.", 400)
        clean.append(layer)
    return clean, None


@layers_bp.get("")
def get_layers():
    image_id = request.args.get("image_id", "")
    if not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    try:
        layers = _session_service().get_layers(image_id)
    except FileNotFoundError:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return jsonify(success=True, image_id=image_id, layers=layers)


@layers_bp.put("")
def save_layers():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    layers, error = _validate_layers(payload.get("layers"))
    if error is not None:
        return error
    try:
        saved = _session_service().save_layers(image_id, layers)
    except FileNotFoundError:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return jsonify(success=True, image_id=image_id, layers=saved)
