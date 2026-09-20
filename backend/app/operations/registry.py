"""Operation registry: one declaration per API image operation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from PIL import Image

from ..error_codes import ErrorCodes
from ..errors import InvalidRequestError
from ..services.process_operations import (
    apply_blur,
    apply_brightness,
    apply_contrast,
    apply_gamma,
    apply_grayscale,
    apply_laplacian,
    apply_median_filter,
    apply_morphology,
    apply_negative,
    apply_saturation,
    apply_sharpen,
    apply_sobel,
    apply_threshold,
    compute_histogram,
)
from ..validation import require_choice, require_int, require_number, require_odd_int


@dataclass(frozen=True)
class OperationSpec:
    """A single API operation, declared once and dispatched everywhere.

    ``validate`` normalizes the request payload and raises
    :class:`~backend.app.errors.InvalidRequestError` for bad parameters, so the
    REST route and the pipeline report the same codes. ``run`` applies the
    transform to an in-memory image. ``produces_image`` is False only for
    read-only analyses such as the histogram, which answer with data instead
    of a new image file.
    """

    slug: str
    label: str
    validate: Callable[[dict[str, Any]], dict[str, Any]]
    run: Callable[[Image.Image, dict[str, Any]], Image.Image]
    produces_image: bool = True
    # Declared parameter contract, surfaced by GET /api/capabilities. Keeping it
    # next to ``validate`` is what makes the endpoint trustworthy: the bounds a
    # client reads here are the bounds the validator enforces.
    param_schema: dict[str, Any] = field(default_factory=dict)


def _number(
    params: dict[str, Any],
    key: str,
    *,
    name: str,
    low: float,
    high: float,
    code: str,
    default: float,
) -> float:
    """Validate a numeric field. ``key`` looks the value up; ``name`` labels errors."""
    return require_number(
        params.get(key, default), low=low, high=high, name=name, code=code
    )


def _integer(
    params: dict[str, Any],
    key: str,
    *,
    name: str,
    low: int,
    high: int,
    code: str,
    default: int,
) -> int:
    """Validate an integer field. ``key`` looks the value up; ``name`` labels errors."""
    return require_int(
        params.get(key, default), low=low, high=high, name=name, code=code
    )


def _odd_ksize(
    params: dict[str, Any], *, name: str, low: int, high: int, code: str
) -> int:
    return require_odd_int(
        params.get("ksize", 3), low=low, high=high, name=name, code=code
    )


def _brightness(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params,
        "value",
        name="brightness",
        low=0,
        high=200,
        code="INVALID_BRIGHTNESS",
        default=100,
    )
    return {"value": value}


def _contrast(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params,
        "value",
        name="contrast",
        low=0,
        high=200,
        code="INVALID_CONTRAST",
        default=100,
    )
    return {"value": value}


def _saturation(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params,
        "value",
        name="saturation",
        low=0,
        high=200,
        code="INVALID_SATURATION",
        default=100,
    )
    return {"value": value}


def _blur(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params, "value", name="blur", low=0, high=20, code="INVALID_BLUR", default=0
    )
    return {"value": value}


def _sharpen(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params,
        "value",
        name="sharpen",
        low=0,
        high=5,
        code="INVALID_SHARPEN",
        default=0,
    )
    return {"value": value}


def _gamma(params: dict[str, Any]) -> dict[str, Any]:
    value = _number(
        params,
        "value",
        name="gamma",
        low=0.1,
        high=5.0,
        code="INVALID_GAMMA",
        default=1.0,
    )
    return {"value": float(value)}


def _threshold(params: dict[str, Any]) -> dict[str, Any]:
    value = _integer(
        params,
        "value",
        name="threshold",
        low=0,
        high=255,
        code="INVALID_THRESHOLD",
        default=128,
    )
    return {"value": value}


def _sobel(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "ksize": _odd_ksize(
            params, name="Sobel ksize", low=1, high=7, code="INVALID_SOBEL_KSIZE"
        )
    }


def _median_filter(params: dict[str, Any]) -> dict[str, Any]:
    return {
        "ksize": _odd_ksize(
            params, name="Median ksize", low=1, high=15, code="INVALID_MEDIAN_KSIZE"
        )
    }


def _morphology(params: dict[str, Any]) -> dict[str, Any]:
    operation = require_choice(
        params.get("operation"),
        ("erode", "dilate", "open", "close"),
        name="Morphology operation",
        code="INVALID_MORPHOLOGY_OPERATION",
    )
    ksize = _odd_ksize(
        params, name="Morphology ksize", low=1, high=15, code="INVALID_MORPHOLOGY_KSIZE"
    )
    return {"operation": operation, "ksize": ksize}


def _no_params(params: dict[str, Any]) -> dict[str, Any]:
    """Operations that take no parameters still go through the same path."""
    return {}


def _int_range(low: int, high: int, default: int, code: str) -> dict[str, Any]:
    """Schema fragment for an integer parameter with an inclusive range."""
    return {
        "value": {
            "type": "integer",
            "low": low,
            "high": high,
            "default": default,
            "code": code,
        }
    }


def _odd_ksize_schema(low: int, high: int, code: str) -> dict[str, Any]:
    """Schema fragment for an odd-integer kernel-size parameter."""
    return {
        "ksize": {
            "type": "integer",
            "low": low,
            "high": high,
            "odd": True,
            "default": 3,
            "code": code,
        }
    }


OPERATIONS: dict[str, OperationSpec] = {
    "grayscale": OperationSpec(
        slug="grayscale",
        label="Grayscale",
        validate=_no_params,
        run=lambda image, params: apply_grayscale(image),
    ),
    "negative": OperationSpec(
        slug="negative",
        label="Negative",
        validate=_no_params,
        run=lambda image, params: apply_negative(image),
    ),
    "brightness": OperationSpec(
        slug="brightness",
        label="Brightness",
        validate=_brightness,
        run=lambda image, params: apply_brightness(image, params["value"]),
        param_schema=_int_range(0, 200, 100, "INVALID_BRIGHTNESS"),
    ),
    "contrast": OperationSpec(
        slug="contrast",
        label="Contrast",
        validate=_contrast,
        run=lambda image, params: apply_contrast(image, params["value"]),
        param_schema=_int_range(0, 200, 100, "INVALID_CONTRAST"),
    ),
    "saturation": OperationSpec(
        slug="saturation",
        label="Saturation",
        validate=_saturation,
        run=lambda image, params: apply_saturation(image, params["value"]),
        param_schema=_int_range(0, 200, 100, "INVALID_SATURATION"),
    ),
    "blur": OperationSpec(
        slug="blur",
        label="Blur",
        validate=_blur,
        run=lambda image, params: apply_blur(image, params["value"]),
        param_schema=_int_range(0, 20, 0, "INVALID_BLUR"),
    ),
    "sharpen": OperationSpec(
        slug="sharpen",
        label="Sharpen",
        validate=_sharpen,
        run=lambda image, params: apply_sharpen(image, params["value"]),
        param_schema=_int_range(0, 5, 0, "INVALID_SHARPEN"),
    ),
    "gamma": OperationSpec(
        slug="gamma",
        label="Gamma",
        validate=_gamma,
        run=lambda image, params: apply_gamma(image, params["value"]),
        param_schema={
            "value": {
                "type": "number",
                "low": 0.1,
                "high": 5.0,
                "default": 1.0,
                "code": "INVALID_GAMMA",
            }
        },
    ),
    "threshold": OperationSpec(
        slug="threshold",
        label="Threshold",
        validate=_threshold,
        run=lambda image, params: apply_threshold(image, params["value"]),
        param_schema=_int_range(0, 255, 128, "INVALID_THRESHOLD"),
    ),
    "sobel": OperationSpec(
        slug="sobel",
        label="Sobel edges",
        validate=_sobel,
        run=lambda image, params: apply_sobel(image, params["ksize"]),
        param_schema=_odd_ksize_schema(1, 7, "INVALID_SOBEL_KSIZE"),
    ),
    "laplacian": OperationSpec(
        slug="laplacian",
        label="Laplacian edges",
        validate=_no_params,
        run=lambda image, params: apply_laplacian(image),
    ),
    "median-filter": OperationSpec(
        slug="median-filter",
        label="Median filter",
        validate=_median_filter,
        run=lambda image, params: apply_median_filter(image, params["ksize"]),
        param_schema=_odd_ksize_schema(1, 15, "INVALID_MEDIAN_KSIZE"),
    ),
    "morphology": OperationSpec(
        slug="morphology",
        label="Morphology",
        validate=_morphology,
        run=lambda image, params: apply_morphology(
            image, params["operation"], params["ksize"]
        ),
        param_schema={
            "operation": {
                "type": "choice",
                "choices": ["erode", "dilate", "open", "close"],
                "required": True,
                "code": "INVALID_MORPHOLOGY_OPERATION",
            },
            **_odd_ksize_schema(1, 15, "INVALID_MORPHOLOGY_KSIZE"),
        },
    ),
    # Read-only analysis: answers with data, never writes a new image.
    "histogram": OperationSpec(
        slug="histogram",
        label="Histogram",
        validate=_no_params,
        run=lambda image, params: compute_histogram(image),
        produces_image=False,
    ),
}


def operation_label(slug: str, params: dict[str, Any]) -> str:
    """Human-readable label for history entries and suggestions.

    Kept here because it is the one live piece of the former
    ``operation_service``; the suggestion engine reads it directly.
    """
    if slug == "brightness":
        value = params.get("value")
        return f"Brightness {value}%" if value is not None else "Brightness"
    if slug == "median-filter":
        return "Median filter"
    return spec(slug).label.title()


def spec(slug: str) -> OperationSpec:
    """Return the registered spec, raising for unknown operations."""
    found = OPERATIONS.get(slug)
    if found is None:
        raise InvalidRequestError(
            f"{slug} is not a supported operation.",
            code=ErrorCodes.INVALID_OPERATION.value,
        )
    return found
