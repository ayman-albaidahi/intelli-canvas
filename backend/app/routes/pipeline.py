from flask import Blueprint, jsonify

pipeline_bp = Blueprint(
    "pipeline",
    __name__,
    url_prefix="/api/pipeline",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "Pipeline management is not implemented yet.",
            },
        ),
        501,
    )


@pipeline_bp.route("", methods=["GET", "POST"])
def pipeline():
    return _not_implemented_response()
