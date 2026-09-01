from flask import Blueprint, jsonify

transform_bp = Blueprint(
    "transform",
    __name__,
    url_prefix="/api/transform",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "This image transformation is not implemented yet.",
            },
        ),
        501,
    )


@transform_bp.post("/crop")
def crop_image():
    return _not_implemented_response()


@transform_bp.post("/resize")
def resize_image():
    return _not_implemented_response()


@transform_bp.post("/rotate")
def rotate_image():
    return _not_implemented_response()


@transform_bp.post("/flip")
def flip_image():
    return _not_implemented_response()

