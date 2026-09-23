import io

from flask import Blueprint, jsonify, request, send_file

from ..auth import require_owned_image
from ..dependencies import (
    get_history_comparison_service,
    get_session_service,
    get_storage_service,
)
from ..error_codes import ErrorCodes
from ..errors import error_response
from ..services.history_comparison_service import HistoryComparisonService

history_bp = Blueprint(
    "history",
    __name__,
    url_prefix="/api/history",
)


def _session_service():
    return get_session_service()


def _comparison_service() -> HistoryComparisonService:
    return get_history_comparison_service()


def _parse_index(value):
    if isinstance(value, bool):
        raise ValueError("History index must be an integer.")
    return int(value)


def _image_id():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}
    image_id = payload.get("image_id")
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return None, ownership_error
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
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return ownership_error
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
        return error_response(ErrorCodes.HISTORY_INDEX_INVALID, str(exc), 400)
    return _state(image_id)


@history_bp.post("/undo")
def undo_history():
    image_id, error = _image_id()
    if error:
        return error
    try:
        _session_service().undo(image_id)
    except ValueError as exc:
        return error_response(ErrorCodes.NOTHING_TO_UNDO, str(exc), 400)
    return _state(image_id)


@history_bp.post("/redo")
def redo_history():
    image_id, error = _image_id()
    if error:
        return error
    try:
        _session_service().redo(image_id)
    except ValueError as exc:
        return error_response(ErrorCodes.NOTHING_TO_REDO, str(exc), 400)
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
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return ownership_error
    session = _session_service().get_session(image_id)
    if session is None:
        return error_response(
            ErrorCodes.IMAGE_SESSION_NOT_FOUND, "Image session was not found.", 404
        )
    storage = get_storage_service()
    directory = (
        storage.processed_dir
        if session.get("current_storage") == "processed"
        else storage.uploads_dir
    )
    return jsonify(
        success=True, filename=session.get("current_filename"), directory=directory.name
    )


@history_bp.get("/content/<image_id>/<int:index>")
def history_content(image_id: str, index: int):
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return ownership_error
    try:
        path = _comparison_service().path_for(image_id, index)
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.HISTORY_IMAGE_NOT_FOUND, str(exc), 404)
    except ValueError as exc:
        return error_response(ErrorCodes.HISTORY_INDEX_INVALID, str(exc), 400)
    return send_file(path, max_age=3600)


@history_bp.get("/compare")
def compare_history():
    image_id = request.args.get("image_id")
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return ownership_error
    try:
        from_index = _parse_index(request.args.get("from"))
        to_index = _parse_index(request.args.get("to"))
        comparison = _comparison_service().compare(image_id, from_index, to_index)
    except (TypeError, ValueError) as exc:
        return error_response(ErrorCodes.HISTORY_COMPARISON_INVALID, str(exc), 400)
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.IMAGE_SESSION_NOT_FOUND, str(exc), 404)
    comparison["from"]["url"] = f"/api/history/content/{image_id}/{from_index}"
    comparison["to"]["url"] = f"/api/history/content/{image_id}/{to_index}"
    return jsonify(success=True, comparison=comparison)


@history_bp.post("/diff")
def diff_history():
    payload = request.get_json(silent=True) or {}
    image_id = payload.get("image_id")
    ownership_error = require_owned_image(image_id)
    if ownership_error is not None:
        return ownership_error
    try:
        from_index = _parse_index(payload.get("from_index"))
        to_index = _parse_index(payload.get("to_index"))
        data = _comparison_service().diff_bytes(
            image_id,
            from_index,
            to_index,
            payload.get("mode", "absolute"),
            payload.get("threshold", 0),
        )
    except (TypeError, ValueError) as exc:
        return error_response(ErrorCodes.HISTORY_DIFF_INVALID, str(exc), 400)
    except FileNotFoundError as exc:
        return error_response(ErrorCodes.IMAGE_SESSION_NOT_FOUND, str(exc), 404)
    return send_file(io.BytesIO(data), mimetype="image/png")
