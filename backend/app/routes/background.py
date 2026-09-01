from flask import Blueprint, jsonify

background_bp = Blueprint(
    "background",
    __name__,
    url_prefix="/api/background",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "This background operation is not implemented yet.",
            },
        ),
        501,
    )


@background_bp.post("/remove")
def remove_background():
    return _not_implemented_response()


@background_bp.post("/replace")
def replace_background():
    return _not_implemented_response()
