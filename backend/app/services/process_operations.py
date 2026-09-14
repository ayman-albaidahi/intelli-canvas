"""Pure Pillow and OpenCV/NumPy operations for image processing.

OpenCV and NumPy are intentionally isolated in this module so the route and
orchestration layers remain independent of the pixel-processing stack.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np
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
    """Apply the existing Gaussian blur operation.

    This deliberately remains Pillow's GaussianBlur implementation: the v0.4
    Gaussian-blur roadmap item was already satisfied before OpenCV was added.
    """
    return image.filter(ImageFilter.GaussianBlur(radius=value))


def apply_sharpen(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Sharpness(image).enhance(1 + (value / 5))


def apply_saturation(image: Image.Image, value: int) -> Image.Image:
    return ImageEnhance.Color(image).enhance(value / 100)


def compute_histogram(image: Image.Image) -> dict[str, list[int]]:
    """Return 256-bin channel histograms without changing the source image."""
    if image.mode in {"1", "L"}:
        grayscale = np.asarray(image.convert("L"))
        return {"l": np.histogram(grayscale, bins=256, range=(0, 256))[0].tolist()}

    rgb = np.asarray(image.convert("RGB"))
    return {
        channel: np.histogram(rgb[:, :, index], bins=256, range=(0, 256))[0].tolist()
        for channel, index in (("r", 0), ("g", 1), ("b", 2))
    }


def _normalized_uint8(values: np.ndarray) -> np.ndarray:
    """Scale signed or floating-point OpenCV output into displayable pixels."""
    absolute = np.abs(values)
    maximum = float(absolute.max()) if absolute.size else 0.0
    if maximum == 0:
        return np.zeros(absolute.shape, dtype=np.uint8)
    return np.clip((absolute / maximum) * 255, 0, 255).astype(np.uint8)


def apply_sobel(image: Image.Image, ksize: int = 3) -> Image.Image:
    grayscale = np.asarray(image.convert("L"))
    sobel_x = cv2.Sobel(grayscale, cv2.CV_64F, 1, 0, ksize=ksize)
    sobel_y = cv2.Sobel(grayscale, cv2.CV_64F, 0, 1, ksize=ksize)
    magnitude = cv2.magnitude(sobel_x, sobel_y)
    return Image.fromarray(_normalized_uint8(magnitude), mode="L").convert("RGB")


def apply_laplacian(image: Image.Image) -> Image.Image:
    grayscale = np.asarray(image.convert("L"))
    laplacian = cv2.Laplacian(grayscale, cv2.CV_64F)
    return Image.fromarray(_normalized_uint8(laplacian), mode="L").convert("RGB")


def apply_median_filter(image: Image.Image, ksize: int = 3) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"))
    return Image.fromarray(cv2.medianBlur(rgb, ksize), mode="RGB")


def apply_morphology(
    image: Image.Image, operation: str, ksize: int = 3
) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"))
    kernel = np.ones((ksize, ksize), dtype=np.uint8)
    if operation == "erode":
        result = cv2.erode(rgb, kernel)
    elif operation == "dilate":
        result = cv2.dilate(rgb, kernel)
    elif operation == "open":
        result = cv2.morphologyEx(rgb, cv2.MORPH_OPEN, kernel)
    elif operation == "close":
        result = cv2.morphologyEx(rgb, cv2.MORPH_CLOSE, kernel)
    else:
        raise ValueError("Unsupported morphology operation.")
    return Image.fromarray(result, mode="RGB")


def apply_gamma(image: Image.Image, gamma: float) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"))
    lookup = np.clip(
        ((np.arange(256, dtype=np.float32) / 255.0) ** (1.0 / gamma)) * 255,
        0,
        255,
    ).astype(np.uint8)
    return Image.fromarray(cv2.LUT(rgb, lookup), mode="RGB")


def apply_threshold(image: Image.Image, value: int) -> Image.Image:
    grayscale = np.asarray(image.convert("L"))
    _, result = cv2.threshold(grayscale, value, 255, cv2.THRESH_BINARY)
    return Image.fromarray(result, mode="L").convert("RGB")


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
