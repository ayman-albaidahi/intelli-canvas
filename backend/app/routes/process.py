from flask import Blueprint, current_app, jsonify, request

from ..api_utils import error_response
from ..services.file_service import FileValidationError
from ..services.process_service import ProcessService

process_bp = Blueprint("process", __name__, url_prefix="/api/process")



def _image_id_from_payload():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, error_response("INVALID_REQUEST", "A JSON request body is required.", 400)
    image_id = payload.get("image_id")
    if not isinstance(image_id, str) or not image_id.strip():
        return None, error_response("INVALID_IMAGE_ID", "A valid image_id is required.", 400)
    if current_app.config["IMAGE_SESSION_SERVICE"].get_session(image_id) is None:
        return None, error_response("IMAGE_SESSION_NOT_FOUND", "Image session was not found.", 404)
    return image_id, None


@process_bp.post("/grayscale")
def convert_to_grayscale():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).grayscale(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("GRAYSCALE_FAILED", "The image could not be converted to grayscale.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key not in {"path"}})


@process_bp.post("/brightness")
def adjust_brightness():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 100)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        return error_response("INVALID_BRIGHTNESS", "Brightness value must be an integer from 0 to 200.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).brightness(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("BRIGHTNESS_FAILED", "The image brightness could not be adjusted.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/contrast")
def adjust_contrast():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 100)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        return error_response("INVALID_CONTRAST", "Contrast value must be an integer from 0 to 200.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).contrast(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("CONTRAST_FAILED", "The image contrast could not be adjusted.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/blur")
def blur_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 0)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 20:
        return error_response("INVALID_BLUR", "Blur value must be an integer from 0 to 20.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).blur(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("BLUR_FAILED", "The image could not be blurred.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/sharpen")
def sharpen_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 0)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 5:
        return error_response("INVALID_SHARPEN", "Sharpen value must be an integer from 0 to 5.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).sharpen(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("SHARPEN_FAILED", "The image could not be sharpened.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/saturation")
def adjust_saturation():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 100)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        return error_response("INVALID_SATURATION", "Saturation value must be an integer from 0 to 200.", 400)
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).saturation(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("SATURATION_FAILED", "The image saturation could not be adjusted.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/negative")
def invert_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).negative(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("NEGATIVE_FAILED", "The image could not be inverted.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/adjustments")
def apply_adjustments():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("INVALID_REQUEST", "A JSON request body is required.", 400)

    values: dict = {}
    for name, low, high, code in (
        ("brightness", 0, 200, "INVALID_BRIGHTNESS"),
        ("contrast", 0, 200, "INVALID_CONTRAST"),
        ("saturation", 0, 200, "INVALID_SATURATION"),
        ("blur", 0, 20, "INVALID_BLUR"),
        ("sharpen", 0, 5, "INVALID_SHARPEN"),
    ):
        value = payload.get(name)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            return error_response(code, f"{name.title()} value must be an integer from {low} to {high}.", 400)
        values[name] = value
    for flag in ("grayscale", "negative"):
        value = payload.get(flag)
        if value is None:
            continue
        if not isinstance(value, bool):
            return error_response(f"INVALID_{flag.upper()}", f"{flag.title()} must be a boolean.", 400)
        values[flag] = value

    neutral = {"brightness": 100, "contrast": 100, "saturation": 100, "blur": 0, "sharpen": 0}
    changed = [key for key, value in values.items() if key in neutral and value != neutral[key]]
    changed += [flag for flag in ("grayscale", "negative") if values.get(flag)]
    if not changed:
        return error_response("NO_ADJUSTMENTS", "At least one adjustment must change from its neutral value.", 400)

    try:
        result = ProcessService(current_app.config["IMAGE_SESSION_SERVICE"], current_app.config["FILE_STORAGE_SERVICE"]).adjustments(image_id, values)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("ADJUSTMENTS_FAILED", "The adjustments could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/histogram")
def image_histogram():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        histogram = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).histogram(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("HISTOGRAM_FAILED", "The image histogram could not be computed.", 400)
    return jsonify(success=True, histogram=histogram)


@process_bp.post("/sobel")
def sobel_edges():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    ksize = payload.get("ksize", 3)
    if isinstance(ksize, bool) or not isinstance(ksize, int) or not 1 <= ksize <= 7 or not ksize % 2:
        return error_response("INVALID_SOBEL_KSIZE", "Sobel ksize must be an odd integer from 1 to 7.", 400)
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).sobel(image_id, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("SOBEL_FAILED", "Sobel edge detection could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/laplacian")
def laplacian_edges():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).laplacian(image_id)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("LAPLACIAN_FAILED", "Laplacian edge detection could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/median-filter")
def median_filter():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    ksize = payload.get("ksize", 3)
    if isinstance(ksize, bool) or not isinstance(ksize, int) or not 1 <= ksize <= 15 or not ksize % 2:
        return error_response("INVALID_MEDIAN_KSIZE", "Median ksize must be an odd integer from 1 to 15.", 400)
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).median_filter(image_id, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("MEDIAN_FILTER_FAILED", "The median filter could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/morphology")
def morphology():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    operation = payload.get("operation")
    if operation not in {"erode", "dilate", "open", "close"}:
        return error_response("INVALID_MORPHOLOGY_OPERATION", "Morphology operation must be erode, dilate, open, or close.", 400)
    ksize = payload.get("ksize", 3)
    if isinstance(ksize, bool) or not isinstance(ksize, int) or not 1 <= ksize <= 15 or not ksize % 2:
        return error_response("INVALID_MORPHOLOGY_KSIZE", "Morphology ksize must be an odd integer from 1 to 15.", 400)
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).morphology(image_id, operation, ksize)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("MORPHOLOGY_FAILED", "The morphology operation could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/gamma")
def gamma_correction():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 1.0)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0.1 <= value <= 5.0:
        return error_response("INVALID_GAMMA", "Gamma value must be a number from 0.1 to 5.0.", 400)
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).gamma(image_id, float(value))
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("GAMMA_FAILED", "Gamma correction could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})


@process_bp.post("/threshold")
def threshold_image():
    image_id, error = _image_id_from_payload()
    if error:
        return error
    payload = request.get_json(silent=True) or {}
    value = payload.get("value", 128)
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 255:
        return error_response("INVALID_THRESHOLD", "Threshold value must be an integer from 0 to 255.", 400)
    try:
        result = ProcessService(
            current_app.config["IMAGE_SESSION_SERVICE"],
            current_app.config["FILE_STORAGE_SERVICE"],
        ).threshold(image_id, value)
    except (FileNotFoundError, FileValidationError) as exc:
        return error_response("IMAGE_NOT_AVAILABLE", str(exc), 404)
    except (OSError, ValueError):
        return error_response("THRESHOLD_FAILED", "Thresholding could not be applied.", 400)
    return jsonify(success=True, image={key: value for key, value in result.items() if key != "path"})
