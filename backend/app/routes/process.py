from flask import Blueprint, jsonify

process_bp = Blueprint(
    "process",
    __name__,
    url_prefix="/api/process",
)


def _not_implemented_response():
    return (
        jsonify(
            success=False,
            error={
                "code": "NOT_IMPLEMENTED",
                "message": "This image processing operation is not implemented yet.",
            },
        ),
        501,
    )


@process_bp.post("/grayscale")
def convert_to_grayscale():
    return _not_implemented_response()


@process_bp.post("/brightness")
def adjust_brightness():
    return _not_implemented_response()


@process_bp.post("/contrast")
def adjust_contrast():
    return _not_implemented_response()


@process_bp.post("/blur")
def blur_image():
    return _not_implemented_response()


@process_bp.post("/sharpen")
def sharpen_image():
    return _not_implemented_response()
