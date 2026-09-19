"""Deterministic, explainable Smart Suggestions for v0.8.1."""

from __future__ import annotations

from typing import Any

from ..operations.registry import operation_label

RULE_VERSION = "0.8.1"
TARGET_BRIGHTNESS = 145


def _node(node_id: str, operation: str, params: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node_id,
        "operation": operation,
        "parameters": params,
        "enabled": True,
    }


def _suggestion(
    suggestion_id: str,
    title: str,
    reason: str,
    confidence: float,
    evidence: dict[str, Any],
    nodes: list[dict[str, Any]],
    findings: list[str],
) -> dict[str, Any]:
    first = nodes[0]
    operation = {
        "type": first["operation"],
        "params": first["parameters"],
        "label": operation_label(first["operation"], first["parameters"]),
    }
    return {
        "id": suggestion_id,
        "type": suggestion_id,
        "title": title,
        "rule_version": RULE_VERSION,
        "reason": reason,
        "evidence": evidence,
        "confidence": round(max(0.0, min(1.0, confidence)), 2),
        "source_findings": findings,
        "pipeline": {"version": 1, "nodes": nodes},
        "suggested_operation": operation,
    }


def suggestion_from_finding(
    finding: dict[str, Any], metrics: dict[str, Any]
) -> dict[str, Any] | None:
    code = finding.get("code")
    evidence = finding.get("evidence", {})
    if code == "LOW_BRIGHTNESS":
        mean = float(evidence.get("brightness_mean", metrics.get("brightness_mean", 0)))
        boost = max(105, min(160, round(TARGET_BRIGHTNESS - mean)))
        return _suggestion(
            "BRIGHTNESS_BOOST",
            "Improve low brightness",
            f"السطوع {mean:g} أقل من النطاق المستهدف؛ increase exposure toward the comfortable target.",
            (110 - mean) / 110,
            evidence,
            [_node("suggestion-brightness", "brightness", {"value": boost})],
            [code],
        )
    if code == "LOW_CONTRAST":
        stddev = float(
            evidence.get("contrast_stddev", metrics.get("contrast_stddev", 0))
        )
        return _suggestion(
            "CONTRAST_BOOST",
            "Improve low contrast",
            f"التباين {stddev:g} منخفض؛ a moderate contrast increase can restore separation between tones.",
            (20 - stddev) / 20,
            evidence,
            [_node("suggestion-contrast", "contrast", {"value": 130})],
            [code],
        )
    if code == "HIGH_BRIGHTNESS":
        mean = float(
            evidence.get("brightness_mean", metrics.get("brightness_mean", 180))
        )
        return _suggestion(
            "BRIGHTNESS_REDUCE",
            "Reduce high brightness",
            f"Brightness {mean:g} is above the target range; reduce it to protect highlight detail.",
            (mean - 180) / 75,
            evidence,
            [_node("suggestion-brightness-reduce", "brightness", {"value": 120})],
            [code],
        )
    if code == "LOW_SHARPNESS":
        score = float(
            evidence.get("sharpness_score", metrics.get("sharpness_score", 0))
        )
        return _suggestion(
            "SHARPNESS_BOOST",
            "Improve sharpness",
            f"Sharpness score {score:g} is below the target; apply a restrained sharpen operation.",
            (35 - score) / 35,
            evidence,
            [_node("suggestion-sharpen", "sharpen", {"value": 1})],
            [code],
        )
    if code == "HIGH_NOISE":
        noise = float(evidence.get("noise_score", metrics.get("noise_score", 0)))
        return _suggestion(
            "NOISE_REDUCTION",
            "Reduce image noise",
            f"Noise estimate {noise:g} is elevated; use a small median filter to reduce isolated noise.",
            min(1.0, (noise - 8) / 12),
            evidence,
            [_node("suggestion-denoise", "median-filter", {"ksize": 3})],
            [code],
        )
    return None


def low_target() -> float:
    return 110.0


def build_suggestions(
    findings: list[dict[str, Any]], metrics: dict[str, Any]
) -> list[dict[str, Any]]:
    codes = {finding.get("code") for finding in findings}
    suggestions: list[dict[str, Any]] = []
    for finding in findings:
        suggestion = suggestion_from_finding(finding, metrics)
        if suggestion and not (
            suggestion["type"] == "SHARPNESS_BOOST" and "HIGH_NOISE" in codes
        ):
            suggestions.append(suggestion)
    if {"LOW_BRIGHTNESS", "LOW_CONTRAST"}.issubset(codes):
        brightness = float(metrics.get("brightness_mean", 0))
        contrast = float(metrics.get("contrast_stddev", 0))
        suggestions.insert(
            0,
            _suggestion(
                "EXPOSURE_AND_CONTRAST",
                "Balance exposure and contrast",
                "Brightness and contrast are both below target; apply a restrained two-step Pipeline from the original source.",
                min(1.0, ((110 - brightness) / 110 + (20 - contrast) / 20) / 2),
                {
                    "brightness_mean": brightness,
                    "contrast_stddev": contrast,
                    "target_brightness": [110, 180],
                    "target_contrast_min": 20,
                },
                [
                    _node(
                        "suggestion-brightness",
                        "brightness",
                        {
                            "value": max(
                                105, min(160, round(TARGET_BRIGHTNESS - brightness))
                            )
                        },
                    ),
                    _node("suggestion-contrast", "contrast", {"value": 130}),
                ],
                ["LOW_BRIGHTNESS", "LOW_CONTRAST"],
            ),
        )
    return suggestions
