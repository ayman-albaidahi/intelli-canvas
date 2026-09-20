"""API capability discovery.

The frontend needs to know which operations the running backend supports, and
what parameter ranges each one accepts, so it can disable unsupported tools
instead of failing on a 404. This endpoint is the single source of that truth.

The response is derived from :data:`~backend.app.operations.registry.OPERATIONS`
rather than maintained by hand: a new operation appears here automatically, and
a parameter range changed in the registry is reflected here without a second
edit. That coupling is the point — a hand-written capability list would drift
from the registry exactly the way the pre-restructuring operation definitions
drifted from each other.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from ..operations.registry import OPERATIONS

capabilities_bp = Blueprint("capabilities", __name__)

# Static facts about the API surface that do not come from the registry.
API_VERSION = "v0.9.1"


@capabilities_bp.get("/api/capabilities")
def capabilities():
    """Report the operations and parameter contracts the backend supports."""
    operations = {
        slug: {
            "label": operation.label,
            "produces_image": operation.produces_image,
            "params": _param_schema(operation),
        }
        for slug, operation in OPERATIONS.items()
    }
    return jsonify(
        success=True,
        version=API_VERSION,
        operations=operations,
    )


def _param_schema(operation) -> dict:
    """Describe the parameters one operation accepts.

    The registry's ``validate`` is a callable, not data, so the bounds cannot be
    read off it directly. Rather than duplicating the ranges here (which would
    drift), each operation declares its own schema next to its validator and
    this method only reads it back.
    """
    schema = getattr(operation, "param_schema", None)
    return schema or {}
