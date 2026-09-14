import io

from flask import Blueprint, current_app, jsonify, request, send_file

from ..api_utils import error_response
from ..services.analysis_service import analyze_cached

analysis_bp = Blueprint(
    "analysis",
    __name__,
    url_prefix="/api/analysis",
)


def _session_image(image_id: str):
    session_service = current_app.config["IMAGE_SESSION_SERVICE"]
    session = session_service.get_session(image_id)
    if session is None:
        return None
    from pathlib import Path


    storage = current_app.config["FILE_STORAGE_SERVICE"]
    directory = (
        storage.processed_dir
        if session.get("current_storage") == "processed"
        else storage.uploads_dir
    )
    source_path = Path(directory) / (session.get("current_filename") or "")
    if not source_path.is_file():
        return None
    from PIL import Image

    return Image.open(source_path), source_path


@analysis_bp.post("")
def analyze_image():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    source = _session_image(image_id)
    if source is None:
        return error_response("IMAGE_NOT_AVAILABLE", "Stored image was not found.", 404)
    image, source_path = source
    with image:
        options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
        report = analyze_cached(image, source_path, current_app.config["FILE_STORAGE_SERVICE"].resolve_storage_dir("analysis-cache"), options)
    return jsonify(success=True, image_id=image_id, **report)


@analysis_bp.post("/export-report")
def export_report():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    source = _session_image(image_id)
    if source is None:
        return error_response("IMAGE_NOT_AVAILABLE", "Stored image was not found.", 404)
    image, source_path = source
    with image:
        options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
        report = analyze_cached(image, source_path, current_app.config["FILE_STORAGE_SERVICE"].resolve_storage_dir("analysis-cache"), options)
    buffer = io.BytesIO()
    buffer.write(jsonify(success=True, image_id=image_id, **report).get_data())
    buffer.seek(0)
    return send_file(buffer, mimetype="application/json", as_attachment=True, download_name="analysis.json")
