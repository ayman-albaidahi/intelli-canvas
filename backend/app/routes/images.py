from flask import Blueprint, current_app, jsonify, request, send_file

from ..services.file_service import FileStorageService, FileValidationError
from ..services.image_io_service import ImageIOService
from ..services.image_session_service import ImageSessionService

images_bp = Blueprint(
    "images",
    __name__,
    url_prefix="/api/images",
)


def _error_response(code: str, message: str, status_code: int):
    return (
        jsonify(success=False, error={"code": code, "message": message}),
        status_code,
    )


def _get_session_service() -> ImageSessionService:
    return current_app.config["IMAGE_SESSION_SERVICE"]


@images_bp.post("")
def upload_image():
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return _error_response("INVALID_REQUEST", "No file was uploaded.", 400)

    filename = uploaded_file.filename or ""
    if not filename or not filename.strip():
        return _error_response("INVALID_REQUEST", "Filename is required.", 400)

    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        return _error_response(
            "INVALID_FILE", "Unsafe file path is not allowed.", 400
        )

    try:
        storage_service = FileStorageService()
        storage_service.validate_file(uploaded_file, filename)
        saved_path = storage_service.save_file(uploaded_file, filename)

        image_metadata = {
            "original_filename": filename,
            "stored_filename": saved_path.name,
            "format": saved_path.suffix.lower().lstrip("."),
            "mime_type": storage_service.detect_mime_type(
                uploaded_file, filename
            ),
            "size": saved_path.stat().st_size,
        }

        try:
            session_data = _get_session_service().create_session(
                image_metadata
            )
        except Exception:
            if saved_path.exists():
                saved_path.unlink()
            raise

        public_image = {
            "image_id": session_data["image_id"],
            "original_filename": session_data["original_filename"],
            "format": session_data["format"],
            "mime_type": session_data["mime_type"],
            "size": session_data["size"],
        }
        return jsonify(success=True, image=public_image)
    except FileValidationError as exc:
        return _error_response("INVALID_FILE", str(exc), 400)
    except Exception:
        return _error_response(
            "UPLOAD_FAILED", "The image could not be uploaded.", 500
        )


@images_bp.post("/convert")
def convert_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    target_format = payload.get("format")
    if not isinstance(image_id, str) or not image_id.strip():
        return _error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if not isinstance(target_format, str) or not target_format.strip():
        return _error_response(
            "INVALID_FORMAT", "A target format is required.", 400
        )
    if image_id not in current_app.config["IMAGE_SESSIONS"]:
        return _error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = ImageIOService(
            _get_session_service(), FileStorageService()
        ).convert(image_id, target_format)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response(
            "CONVERSION_FAILED", "The image could not be converted.", 400
        )

    return jsonify(
        success=True,
        image={
            "image_id": result["image_id"],
            "width": result["width"],
            "height": result["height"],
            "format": result["format"],
            "mime_type": result["mime_type"],
        },
    )


@images_bp.post("/export")
def export_image():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response(
            "INVALID_REQUEST", "A JSON request body is required.", 400
        )

    image_id = payload.get("image_id")
    target_format = payload.get("format")
    if not isinstance(image_id, str) or not image_id.strip():
        return _error_response(
            "INVALID_IMAGE_ID", "A valid image_id is required.", 400
        )
    if not isinstance(target_format, str) or not target_format.strip():
        return _error_response(
            "INVALID_FORMAT", "A target format is required.", 400
        )
    if image_id not in current_app.config["IMAGE_SESSIONS"]:
        return _error_response(
            "IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404
        )

    try:
        result = ImageIOService(
            _get_session_service(), FileStorageService()
        ).convert(image_id, target_format)
    except (FileNotFoundError, FileValidationError) as exc:
        return _error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return _error_response(
            "EXPORT_FAILED", "The image could not be exported.", 400
        )

    return send_file(
        result["path"],
        mimetype=result["mime_type"],
        as_attachment=True,
        download_name=result["filename"],
    )
