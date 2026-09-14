"""Pure Pillow operations used by the process orchestration service."""

from __future__ import annotations

from typing import Any

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def apply_negative(image: Image.Image) -> Image.Image:
    return ImageOps.invert(image.convert("RGB"))


def apply_grayscale(image: Image.Image) -> Image.Image:
    return ImageOps.grayscale(image).convert("RGB")


def apply_brightness(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Brightness(image).enhance(value / 100)


def apply_contrast(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Contrast(image).enhance(value / 100)


def apply_blur(image: Image.Image, value: int) -> Image.Image:
    return image.filter(ImageFilter.GaussianBlur(radius=value))


def apply_sharpen(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Sharpness(image).enhance(1 + (value / 5))


def apply_saturation(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Color(image).enhance(value / 100)


def apply_chain(image: Image.Image, values: dict[str, Any]) -> Image.Image:
    """Apply the requested adjustments in the existing UI order."""
    result = image
    if values.get("brightness", 100) != 100:
        result = apply_brightness(result, values["brightness"])
    if values.get("contrast", 100) != 100:
        result = apply_contrast(result, values["contrast"])
    if values.get("saturation", 100) != 100:
        result = apply_saturation(result, values["saturation"])
    if values.get("grayscale", False):
        result = apply_grayscale(result)
    if values.get("blur", 0) > 0:
        result = apply_blur(result, values["blur"])
    if values.get("sharpen", 0) != 0:
        result = apply_sharpen(result, values["sharpen"])
    if values.get("negative", False):
        result = apply_negative(result)
    return result
