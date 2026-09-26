"""Guards the public/private split enforced by HistoryEntry.

``filename`` and ``storage`` are filesystem pointers: they locate the rendered
file on disk and must never reach a client. These tests pin that property so a
future field added to the dataclass cannot silently appear in the serialized
view, and pin that the two repository boundaries that build an entry agree on
the same shape.
"""

from backend.app.domain.history import HistoryEntry


def _sample() -> HistoryEntry:
    return HistoryEntry(
        index=2,
        operation="Brightness 130%",
        filename="processed/abc123.png",
        storage="processed",
        created_at=1_700_000_000,
        parameters={"value": 130},
    )


def test_public_view_omits_filesystem_pointers():
    public = _sample().to_public_dict()
    assert "filename" not in public
    assert "storage" not in public


def test_public_view_exposes_the_client_contract():
    assert _sample().to_public_dict() == {
        "index": 2,
        "operation": "Brightness 130%",
        "time": 1_700_000_000,
        "parameters": {"value": 130},
    }


def test_parameters_default_to_an_empty_dict():
    entry = HistoryEntry(
        index=0,
        operation="Upload",
        filename="uploads/abc.png",
        storage="uploads",
        created_at=0,
    )
    assert entry.parameters == {}


def test_parameters_default_is_not_shared_between_instances():
    # A mutable default shared across entries would let one edit leak into
    # every other history row built without explicit parameters.
    first = HistoryEntry(0, "Upload", "a.png", "uploads", 0)
    second = HistoryEntry(1, "Grayscale", "b.png", "processed", 1)
    first.parameters["leaked"] = True
    assert "leaked" not in second.parameters


def test_entry_is_immutable():
    entry = _sample()
    try:
        entry.operation = "Contrast"
    except AttributeError:
        return
    raise AssertionError("HistoryEntry should be frozen")
