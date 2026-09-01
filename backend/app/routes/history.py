from flask import Blueprint, jsonify


history_bp = Blueprint(
    "history",
    __name__,
    url_prefix="/api/history",
)


def _not_implemented_response():
    return jsonify(
        success=False,
        error={
            "code": "NOT_IMPLEMENTED",
            "message": "History management is not implemented yet.",
        },
    ), 501


@history_bp.get("")
def get_history():
    return _not_implemented_response()
