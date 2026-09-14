from flask import Blueprint

from ..api_utils import error_response

pipeline_bp = Blueprint(
    "pipeline",
    __name__,
    url_prefix="/api/pipeline",
)


def _not_implemented_response():
    return error_response("NOT_IMPLEMENTED", "Pipeline management is not implemented yet.", 501)

@pipeline_bp.route("", methods=["GET", "POST"])
def pipeline():
    return _not_implemented_response()
