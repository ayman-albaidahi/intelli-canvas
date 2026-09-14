"""Deterministic image analysis (Phase 3).

Analyzes brightness and contrast with Pillow statistics only — no AI, no
image modification.
"""
from __future__ import annotations

from typing import Any

from PIL import Image, ImageStat

BRIGHTNESS_RANGE = (110, 180)
LOW_CONTRAST_STDDEV = 20.0


def analyze(image: Image.Image) -> dict[str, Any]:
    """Returns metrics and findings for the image. Read-only."""
    gray = image.convert("L")
    stat = ImageStat.Stat(gray)
    mean = round(stat.mean[0], 1)
    stddev = round(stat.stddev[0], 1)
    width, height = image.size

    metrics = {
        "width": width,
        "height": height,
        "brightness_mean": mean,
        "contrast_stddev": stddev,
    }

    findings: list[dict[str, Any]] = []
    low, high = BRIGHTNESS_RANGE
    if mean < low:
        findings.append({
            "code": "LOW_BRIGHTNESS",
            "severity": "high" if mean < 70 else "medium",
            "evidence": {"brightness_mean": mean, "target_range": list(BRIGHTNESS_RANGE)},
        })
    elif mean > high:
        findings.append({
            "code": "HIGH_BRIGHTNESS",
            "severity": "medium",
            "evidence": {"brightness_mean": mean, "target_range": list(BRIGHTNESS_RANGE)},
        })
    if stddev < LOW_CONTRAST_STDDEV:
        findings.append({
            "code": "LOW_CONTRAST",
            "severity": "high" if stddev < 10 else "medium",
            "evidence": {"contrast_stddev": stddev},
        })

    return {"metrics": metrics, "findings": findings}
