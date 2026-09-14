import base64
import binascii
import io
import time
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file

from ..api_utils import error_response
from ..services.file_service import FileStorageService, FileValidationError

layers_bp = Blueprint(
    "layers",
    __name__,
    url_prefix="/api/layers",
)

MAX_LAYERS = 100
MAX_LAYER_PAYLOAD_BYTES = 2_000_000
ALLOWED_TYPES = {"brush", "shape", "text", "image"}
DATA_URL_PREFIX = "data:"


def _session_service():
    return current_app.config["IMAGE_SESSION_SERVICE"]


def _validate_layers(payload):
    if not isinstance(payload, list):
        return None, error_response("INVALID_LAYERS", "layers must be an array.", 400)
    if len(payload) > MAX_LAYERS:
        return None, error_response("INVALID_LAYERS", "Too many layers.", 400)
    try:
        import json

        if len(json.dumps(payload, separators=(",", ":"))) > MAX_LAYER_PAYLOAD_BYTES:
            return None, error_response("INVALID_LAYERS", "Layer payload is too large.", 413)
    except (TypeError, ValueError):
        return None, error_response("INVALID_LAYERS", "Layer payload must be JSON serializable.", 400)

    clean = []
    for layer in payload:
        if not isinstance(layer, dict):
            return None, error_response("INVALID_LAYERS", "Each layer must be an object.", 400)
        if layer.get("type") not in ALLOWED_TYPES:
            return None, error_response("INVALID_LAYERS", "Layer type is not supported.", 400)
        if not isinstance(layer.get("id"), str) or not layer["id"].strip():
            return None, error_response("INVALID_LAYERS", "Each layer needs an id.", 400)
        clean.append(dict(layer))
    return clean, None


def _store_data_url(image_id, layer, storage, repository):
    source = layer.get("src")
    if not isinstance(source, str) or not source.startswith(DATA_URL_PREFIX):
        return layer
    try:
        header, encoded = source.split(",", 1)
        mime_type = header[5:].split(";", 1)[0].lower()
        if mime_type not in {"image/png", "image/jpeg", "image/webp", "image/bmp"} or ";base64" not in header:
            raise ValueError("Unsupported data URL.")
        content = base64.b64decode(encoded, validate=True)
        extension = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/bmp": ".bmp"}[mime_type]
        stored = storage.save_file(io.BytesIO(content), f"layer-{uuid.uuid4().hex}{extension}", destination="layer-assets")
    except (ValueError, binascii.Error, FileValidationError) as exc:
        raise ValueError("Layer image asset is invalid.") from exc
    asset = repository.create_asset({
        "asset_id": uuid.uuid4().hex,
        "image_id": image_id,
        "storage_category": "layer-assets",
        "stored_filename": stored.name,
        "mime_type": mime_type,
        "size": len(content),
        "created_at": int(time.time()),
    })
    layer.pop("src", None)
    layer["asset_id"] = asset["asset_id"]
    layer["src"] = f"/api/layers/assets/{asset['asset_id']}"
    return layer


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


@layers_bp.post("/compose")
def compose_layers():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    try:
        result = current_app.config["LAYER_COMPOSITOR_SERVICE"].compose(image_id)
    except FileNotFoundError:
        return error_response("IMAGE_NOT_AVAILABLE", "The image or layer asset was not found.", 404)
    except (OSError, ValueError) as exc:
        return error_response("COMPOSITE_FAILED", str(exc), 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


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
    service = _session_service()
    try:
        service.get_layers(image_id)
        storage = FileStorageService()
        repository = current_app.config["IMAGE_SESSIONS"]
        layers = [_store_data_url(image_id, layer, storage, repository) for layer in layers]
        saved = service.save_layers(image_id, layers)
    except FileNotFoundError:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    except ValueError as exc:
        return error_response("INVALID_LAYER_ASSET", str(exc), 400)
    return jsonify(success=True, image_id=image_id, layers=saved)


@layers_bp.get("/assets/<asset_id>")
def get_layer_asset(asset_id):
    asset = current_app.config["IMAGE_SESSIONS"].get_asset(asset_id)
    if asset is None:
        return error_response("ASSET_NOT_FOUND", "Layer asset was not found.", 404)
    path = FileStorageService().resolve_storage_dir(asset["storage_category"]) / asset["stored_filename"]
    if not path.is_file():
        return error_response("ASSET_NOT_FOUND", "Layer asset was not found.", 404)
    return send_file(path, mimetype=asset["mime_type"], conditional=True)
