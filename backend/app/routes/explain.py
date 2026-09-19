from flask import Blueprint, jsonify, request

from ..errors import error_response
from ..services.explainability_service import explain_operation
from ..services.pipeline_service import PipelineParamError

explain_bp = Blueprint("explain", __name__, url_prefix="/api/explain-operation")


@explain_bp.post("")
def explain_operation_route():
    payload = request.get_json(silent=True) or {}
    operation = payload.get("operation")
    if not isinstance(operation, str) or not operation.strip():
        return error_response("INVALID_OPERATION", "operation is required.", 400)
    try:
        explanation = explain_operation(
            operation,
            payload.get("parameters") or {},
            finding=payload.get("finding") if isinstance(payload.get("finding"), dict) else None,
            source=payload.get("source") if isinstance(payload.get("source"), dict) else None,
        )
    except PipelineParamError as exc:
        return error_response("INVALID_OPERATION", str(exc), 400)
    return jsonify(success=True, explanation=explanation)
