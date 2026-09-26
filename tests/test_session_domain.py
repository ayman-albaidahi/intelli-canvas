"""Guards the ImageSession wrapper around the repository row.

Before this type the repository returned a raw ``SELECT *`` row and 17 call
sites reached in with ``session.get(...)``; the row's column names and the
service contract were the same thing. These tests pin the promoted attributes
clients now read by name, and pin that the long-tail columns still resolve
through ``get`` instead of vanishing.
"""

from backend.app.domain.session import ImageSession


def _row() -> dict:
    return {
        "image_id": "abc123",
        "project_id": "proj1",
        "current_filename": "out.png",
        "current_storage": "processed",
        "base_stem": "sample",
        "history_index": 2,
        "original_filename": "sample.png",
        "mime_type": "image/png",
        "size": 4096,
    }


def test_promoted_fields_read_as_attributes():
    session = ImageSession.from_row(_row())
    assert session.image_id == "abc123"
    assert session.current_filename == "out.png"
    assert session.current_storage == "processed"
    assert session.base_stem == "sample"
    assert session.history_index == 2
    assert session.project_id == "proj1"


def test_unpromoted_columns_resolve_through_get():
    # The long tail of the row is not promoted, but it must still be readable
    # — services read stored_filename, mime_type and size through this path.
    session = ImageSession.from_row(_row())
    assert session.get("original_filename") == "sample.png"
    assert session.get("mime_type") == "image/png"
    assert session.get("size") == 4096


def test_get_returns_default_for_missing_columns():
    session = ImageSession.from_row({"image_id": "abc123"})
    assert session.get("nope") is None
    assert session.get("nope", "fallback") == "fallback"


def test_defaults_for_a_minimal_row():
    session = ImageSession.from_row({"image_id": "abc123"})
    assert session.current_filename == ""
    assert session.current_storage == "uploads"
    assert session.base_stem == "image"
    assert session.history_index == 0
    assert session.history == ()
    assert session.layers == ()


def test_history_and_layers_default_to_empty_tuples():
    # Consumers iterate these unconditionally; a None here would be a
    # TypeError at the call site rather than a no-op loop.
    session = ImageSession.from_row(_row())
    assert session.history == ()
    assert session.layers == ()


def test_session_is_immutable():
    session = ImageSession.from_row(_row())
    try:
        session.current_filename = "other.png"
    except AttributeError:
        return
    raise AssertionError("ImageSession should be frozen")
