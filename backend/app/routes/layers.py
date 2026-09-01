from flask import Blueprint, jsonify


layers_bp = Blueprint(
    "layers",
    __name__,
    url_prefix="/api/layers",
)


def _not_implemented_response():
    return jsonify(
        success=False,
        error={
            "code": "NOT_IMPLEMENTED",
            "message": "Layer management is not implemented yet.",
        },
    ), 501


@layers_bp.route("", methods=["GET", "POST"])
def layers():
    return _not_implemented_response()
