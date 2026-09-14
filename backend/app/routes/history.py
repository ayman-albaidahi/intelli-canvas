from flask import Blueprint, current_app, jsonify, request

from ..api_utils import error_response

history_bp = Blueprint(
    "history",
    __name__,
    url_prefix="/api/history",
)



def _session_service():
    return current_app.config["IMAGE_SESSION_SERVICE"]


def _image_id():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if _session_service().get_session(image_id) is None:
        return None, error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return image_id, None


def _state(image_id: str):
    session_service = _session_service()
    session = session_service.get_session(image_id)
    history = session_service.history(image_id)
    return jsonify(
        success=True,
        image={
            "image_id": image_id,
            "current_filename": session.get("current_filename"),
            "index": history["index"],
            "total": history["total"],
            "entries": history["entries"],
        },
    )


@history_bp.get("")
def get_history():
    image_id = request.args.get("image_id")
    if not image_id:
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if _session_service().get_session(image_id) is None:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return _state(image_id)


@history_bp.post("/goto")
def goto_history():
    image_id, error = _image_id()
    if error:
        return error
    index = (request.get_json(silent=True) or {}).get("index")
    try:
        _session_service().goto(image_id, index)
    except ValueError as exc:
        return error_response("HISTORY_INDEX_INVALID", str(exc), 400)
    return _state(image_id)


@history_bp.post("/undo")
def undo_history():
    image_id, error = _image_id()
    if error:
        return error
    try:
        _session_service().undo(image_id)
    except ValueError as exc:
        return error_response("NOTHING_TO_UNDO", str(exc), 400)
    return _state(image_id)


@history_bp.post("/redo")
def redo_history():
    image_id, error = _image_id()
    if error:
        return error
    try:
        _session_service().redo(image_id)
    except ValueError as exc:
        return error_response("NOTHING_TO_REDO", str(exc), 400)
    return _state(image_id)


@history_bp.post("/clear")
def clear_history():
    image_id, error = _image_id()
    if error:
        return error
    _session_service().clear_history(image_id)
    return _state(image_id)


@history_bp.get("/current-file")
def current_file():
    image_id = request.args.get("image_id")
    if not image_id:
        return error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    session = _session_service().get_session(image_id)
    if session is None:
        return error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    storage = current_app.config["FILE_STORAGE_SERVICE"]
    directory = storage.processed_dir if session.get("current_storage") == "processed" else storage.uploads_dir
    return jsonify(success=True, filename=session.get("current_filename"), directory=directory.name)
