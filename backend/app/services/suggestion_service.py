"""Explainable suggestions (Phase 4).

Converts analysis findings into explainable, previewable suggestions.
Deterministic rules only — no external AI.
"""
from __future__ import annotations

from typing import Any

from ..services.operation_service import operation_label, validate_params

TARGET_BRIGHTNESS = 145  # comfortable highlight-forward target


def suggestion_from_finding(finding: dict[str, Any], metrics: dict[str, Any]) -> dict[str, Any] | None:
    code = finding.get("code")
    if code == "LOW_BRIGHTNESS":
        mean = float(finding["evidence"]["brightness_mean"])
        boost = max(105, min(160, round(TARGET_BRIGHTNESS - mean)))
        return {
            "type": "BRIGHTNESS_BOOST",
            "reason": (
                f"متوسط السطوع {mean} أقل من النطاق المريح 110-180، "
                "لذا يقترح المحرر رفع السطوع لتقرّب الصورة من الهدف."
            ),
            "evidence": finding["evidence"],
            "confidence": round(min(1.0, (low_target() - mean) / low_target()), 2),
            "suggested_operation": {"type": "brightness", "params": {"value": boost}},
        }
    if code == "LOW_CONTRAST":
        stddev = float(finding["evidence"]["contrast_stddev"])
        return {
            "type": "CONTRAST_BOOST",
            "reason": (
                f"تباين الصورة منخفض (انحراف {stddev})، ورفع التباين "
                "يعيد تمييز التفاصيل بين الظل والإضاءة."
            ),
            "evidence": finding["evidence"],
            "confidence": round(min(1.0, (20 - stddev) / 20), 2),
            "suggested_operation": {"type": "contrast", "params": {"value": 130}},
        }
    if code == "HIGH_BRIGHTNESS":
        mean = float(finding["evidence"]["brightness_mean"])
        return {
            "type": "BRIGHTNESS_REDUCE",
            "reason": f"متوسط السطوع {mean} مرتفع عن النطاق المستهدف.",
            "evidence": finding["evidence"],
            "confidence": round(min(1.0, (mean - 180) / 75), 2),
            "suggested_operation": {"type": "brightness", "params": {"value": 120}},
        }
    return None


def low_target() -> float:
    return 110.0


def build_suggestions(findings: list[dict[str, Any]], metrics: dict[str, Any]) -> list[dict[str, Any]]:
    suggestions = []
    for finding in findings:
        suggestion = suggestion_from_finding(finding, metrics)
        if suggestion:
            suggestion["suggested_operation"]["label"] = operation_label(
                suggestion["suggested_operation"]["type"],
                suggestion["suggested_operation"]["params"],
            )
            suggestions.append(suggestion)
    return suggestions


def validate_suggested_operation(suggestion: dict[str, Any]) -> dict[str, Any]:
    operation = suggestion.get("suggested_operation") or {}
    op_type = operation.get("type")
    params = operation.get("params") or {}
    return validate_params(op_type, params)
