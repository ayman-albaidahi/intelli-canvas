from flask import Blueprint

from ..errors import not_implemented_response

pipeline_bp = Blueprint(
    "pipeline",
    __name__,
    url_prefix="/api/pipeline",
)


@pipeline_bp.route("", methods=["GET", "POST"])
def pipeline():
    return not_implemented_response("Pipeline")
