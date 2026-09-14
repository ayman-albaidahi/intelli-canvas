from flask import Blueprint

from ..api_utils import error_response

layers_bp = Blueprint(
    "layers",
    __name__,
    url_prefix="/api/layers",
)


def _not_implemented_response():
    return error_response("NOT_IMPLEMENTED", "Layer management is not implemented yet.", 501)

@layers_bp.route("", methods=["GET", "POST"])
def layers():
    return _not_implemented_response()
