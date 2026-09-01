from flask import Blueprint, jsonify

images_bp = Blueprint(
    "images",
    __name__,
    url_prefix="/api/images",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "This image operation is not implemented yet.",
            },
        ),
        501,
    )


@images_bp.get("")
def list_images():
    return _not_implemented_response()


@images_bp.post("/upload")
def upload_image():
    return _not_implemented_response()


@images_bp.post("/export")
def export_image():
    return _not_implemented_response()
