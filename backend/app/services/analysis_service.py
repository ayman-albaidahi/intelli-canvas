"""Deterministic, read-only image quality analysis for v0.8.0."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

ANALYZER_VERSION = "0.8.0"
BRIGHTNESS_RANGE = (110, 180)
LOW_CONTRAST_STDDEV = 20.0
_MAX_ANALYSIS_SIDE = 1024


def _scaled_rgb(image: Image.Image) -> np.ndarray:
    working = image.convert("RGB")
    if max(working.size) > _MAX_ANALYSIS_SIDE:
        ratio = _MAX_ANALYSIS_SIDE / max(working.size)
        working = working.resize((max(1, round(working.width * ratio)), max(1, round(working.height * ratio))), Image.Resampling.BILINEAR)
    return np.asarray(working, dtype=np.uint8)


def _quality_for_brightness(mean: float) -> float:
    low, high = BRIGHTNESS_RANGE
    if low <= mean <= high:
        return 100.0
    distance = low - mean if mean < low else mean - high
    return round(max(0.0, 100.0 - distance * 1.25), 1)


def analyze(image: Image.Image, options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return a stable quality report without changing the image or session."""
    rgb = _scaled_rgb(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    height, width = gray.shape[:2]
    mean = float(np.mean(gray))
    median = float(np.median(gray))
    contrast = float(np.std(gray))
    laplacian_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharpness = min(100.0, laplacian_variance / 5.0)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    noise = float(np.std(gray.astype(np.float32) - blurred.astype(np.float32)))
    clipped_shadows = float(np.mean(gray <= 3))
    clipped_highlights = float(np.mean(gray >= 252))
    brightness_quality = _quality_for_brightness(mean)
    contrast_quality = min(100.0, contrast * 2.0)
    noise_quality = max(0.0, 100.0 - noise * 5.0)
    clipping_quality = max(0.0, 100.0 - (clipped_shadows + clipped_highlights) * 500.0)
    quality_score = round(max(0.0, min(100.0, (brightness_quality * 0.25) + (contrast_quality * 0.25) + (sharpness * 0.25) + (noise_quality * 0.15) + (clipping_quality * 0.10))), 1)
    metrics = {
        "width": image.width,
        "height": image.height,
        "analysis_width": width,
        "analysis_height": height,
        "pixel_count": image.width * image.height,
        "brightness_mean": round(mean, 1),
        "brightness_median": round(median, 1),
        "contrast_stddev": round(contrast, 1),
        "sharpness_score": round(sharpness, 1),
        "sharpness_raw": round(laplacian_variance, 3),
        "noise_score": round(noise, 3),
        "clipped_shadow_ratio": round(clipped_shadows, 5),
        "clipped_highlight_ratio": round(clipped_highlights, 5),
        "quality_score": quality_score,
    }
    findings: list[dict[str, Any]] = []
    low, high = BRIGHTNESS_RANGE
    if mean < low:
        findings.append({"code": "LOW_BRIGHTNESS", "severity": "high" if mean < 70 else "medium", "evidence": {"brightness_mean": metrics["brightness_mean"], "target_range": [low, high]}})
    elif mean > high:
        findings.append({"code": "HIGH_BRIGHTNESS", "severity": "medium", "evidence": {"brightness_mean": metrics["brightness_mean"], "target_range": [low, high]}})
    if contrast < LOW_CONTRAST_STDDEV:
        findings.append({"code": "LOW_CONTRAST", "severity": "high" if contrast < 10 else "medium", "evidence": {"contrast_stddev": metrics["contrast_stddev"], "target_min": LOW_CONTRAST_STDDEV}})
    if sharpness < 35:
        findings.append({"code": "LOW_SHARPNESS", "severity": "high" if sharpness < 15 else "medium", "evidence": {"sharpness_score": metrics["sharpness_score"], "target_min": 35}})
    if noise > 8:
        findings.append({"code": "HIGH_NOISE", "severity": "medium", "evidence": {"noise_score": metrics["noise_score"], "target_max": 8}})
    if clipped_shadows > 0.03:
        findings.append({"code": "SHADOW_CLIPPING", "severity": "medium", "evidence": {"ratio": metrics["clipped_shadow_ratio"], "target_max": 0.03}})
    if clipped_highlights > 0.03:
        findings.append({"code": "HIGHLIGHT_CLIPPING", "severity": "medium", "evidence": {"ratio": metrics["clipped_highlight_ratio"], "target_max": 0.03}})
    return {"analyzer_version": ANALYZER_VERSION, "metrics": metrics, "findings": findings, "quality_score": quality_score}


def analysis_hash(source_path: Path, options: dict[str, Any] | None = None) -> str:
    digest = hashlib.sha256()
    with source_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    digest.update(ANALYZER_VERSION.encode())
    digest.update(json.dumps(options or {}, sort_keys=True, separators=(",", ":")).encode())
    return digest.hexdigest()[:32]


def analyze_cached(image: Image.Image, source_path: Path, cache_dir: Path, options: dict[str, Any] | None = None) -> dict[str, Any]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    digest = analysis_hash(source_path, options)
    cache_path = cache_dir / f"analysis-cache-{digest}.json"
    if cache_path.is_file():
        try:
            report = json.loads(cache_path.read_text(encoding="utf-8"))
            report["cache_hit"] = True
            report["analysis_hash"] = digest
            return report
        except (OSError, ValueError, TypeError):
            cache_path.unlink(missing_ok=True)
    report = analyze(image, options)
    report["cache_hit"] = False
    report["analysis_hash"] = digest
    cache_path.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return report
