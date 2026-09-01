from flask import Blueprint, jsonify

analysis_bp = Blueprint(
    "analysis",
    __name__,
    url_prefix="/api/analysis",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "Image analysis is not implemented yet.",
            },
        ),
        501,
    )


@analysis_bp.post("")
def analyze_image():
    return _not_implemented_response()
