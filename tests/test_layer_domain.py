"""Guards the Layer wrapper around the editor-authored layer payload.

Layers are deliberately open-shaped: the editor owns the document and the
backend stores it verbatim. What this type owns is the boundary — the shared
fields the compositor branches on are typed attributes, tool-specific reads
funnel through ``get``, and the row bookkeeping never reaches the type.
"""

from backend.app.domain.layer import Layer


def _payload() -> dict:
    return {
        "id": "obj1",
        "type": "brush",
        "visible": True,
        "opacity": 0.8,
        "pointsRel": [(0, 0), (10, 20)],
        "color": "#ff0000",
        "strokeWidth": 3,
    }


def test_shared_fields_are_promoted_to_attributes():
    layer = Layer.from_payload(_payload())
    assert layer.id == "obj1"
    assert layer.type == "brush"
    assert layer.visible is True


def test_get_reads_tool_specific_fields_with_a_default():
    layer = Layer.from_payload(_payload())
    assert layer.get("color") == "#ff0000"
    assert layer.get("nope", "fallback") == "fallback"


def test_public_view_is_the_payload_verbatim():
    # The editor authored this document and reads it back, so echoing it
    # verbatim is the contract — not a projection onto a subset of fields.
    assert Layer.from_payload(_payload()).to_public_dict() == _payload()


def test_public_view_is_a_copy():
    # Mutating the returned view must not corrupt the stored layer; a shared
    # reference would let one response edit leak into the session.
    layer = Layer.from_payload(_payload())
    layer.to_public_dict()["id"] = "tampered"
    assert layer.id == "obj1"


def test_visible_defaults_to_true_when_absent():
    payload = _payload()
    del payload["visible"]
    assert Layer.from_payload(payload).visible is True


def test_payload_default_is_not_shared_between_instances():
    # A mutable default shared across layers would let one brush stroke's
    # points leak into every other layer built without an explicit payload.
    first = Layer(id="a", type="shape")
    second = Layer(id="b", type="shape")
    first.payload["leaked"] = True
    assert "leaked" not in second.payload


def test_layer_is_immutable():
    layer = Layer.from_payload(_payload())
    try:
        layer.type = "text"
    except AttributeError:
        return
    raise AssertionError("Layer should be frozen")
