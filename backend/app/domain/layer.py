"""A layer in an image session's composition.

Layers are authored by the editor and stored verbatim as ``payload_json``.
Their shape is deliberately open: a brush stroke carries ``pointsRel``, a text
layer carries ``text`` and ``fontSize``, a shape carries ``stroke`` and
``fill``. Modeling every tool-specific field would freeze the editor's data
format into the backend, so this type wraps the payload instead of
describing it. Tool-specific reads go through :meth:`get`, which is the one
sanctioned way to reach into it.

What the type does own is the split the repository used to blur: ``id``,
``type`` and ``visible`` are the fields the compositor and the layer list
branch on, and they are promoted to attributes so those reads are typed.
The rest stays in ``payload``, and ``save_layers`` is the only place that
sees the row columns (``layer_id``, ``z_index``, ``payload_json``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Layer:
    """One composable layer over the base image."""

    id: str
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    visible: bool = True

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> Layer:
        """Build a layer from a stored or client-supplied payload dict.

        The payload is the whole layer document, so the shared fields are
        read out of it and the remainder is kept as-is.
        """
        return cls(
            id=payload["id"],
            type=payload["type"],
            payload=payload,
            visible=bool(payload.get("visible", True)),
        )

    def get(self, key: str, default: Any = None) -> Any:
        """Read a tool-specific field off the layer payload.

        This is the sanctioned accessor for the open part of the shape. Call
        sites read ``x``, ``y``, ``w``, ``h``, ``rotation``, ``text`` and
        tool-specific keys; they all funnel through here so a missing field
        degrades to the caller's default rather than raising.
        """
        return self.payload.get(key, default)

    def to_public_dict(self) -> dict[str, Any]:
        """The client view: the stored layer document itself.

        The payload is authored by the editor and echoed back to it, so the
        public view is the payload verbatim — minus nothing, because the row
        bookkeeping (``layer_id``, ``z_index``, the JSON envelope) never
        reaches this type in the first place.
        """
        return dict(self.payload)
