"""Guards the public/private split enforced by OperationResult.

The whole point of the type is that an absolute filesystem path can never
reach a client response. These tests pin that property so a future field added
to the dataclass cannot silently appear in the serialized view.
"""

from pathlib import Path

from backend.app.domain.results import OperationResult
from backend.app.views import public_image


def _sample() -> OperationResult:
    return OperationResult(
        image_id="abc123",
        width=64,
        height=48,
        format="png",
        mime_type="image/png",
        path=Path("/storage/processed/abc123.png"),
        filename="abc123.png",
        public_extras={"operation": "brightness", "value": 120},
    )


def test_public_view_omits_path_entirely():
    """The serialized contract must contain no filesystem path."""
    payload = _sample().to_public_dict()
    assert "path" not in payload
    assert "/storage" not in str(payload)


def test_public_view_includes_public_fields():
    payload = _sample().to_public_dict()
    assert payload["image_id"] == "abc123"
    assert payload["width"] == 64
    assert payload["height"] == 48
    assert payload["format"] == "png"
    assert payload["mime_type"] == "image/png"
    assert payload["filename"] == "abc123.png"
    assert payload["operation"] == "brightness"
    assert payload["value"] == 120


def test_public_image_delegateates_to_operation_result():
    """public_image must route OperationResult through its own allowlist."""
    result = _sample()
    assert public_image(result) == result.to_public_dict()
    assert "path" not in public_image(result)


def test_path_still_readable_by_route():
    """Routes that stream the file keep direct access to the attribute."""
    result = _sample()
    assert result.path == Path("/storage/processed/abc123.png")


def test_missing_filename_is_not_emitted():
    """An empty filename must not produce a null field in the response."""
    result = OperationResult(
        image_id="x",
        width=1,
        height=1,
        format="png",
        mime_type="image/png",
    )
    payload = result.to_public_dict()
    assert "filename" not in payload
    assert "path" not in payload


def test_result_is_immutable():
    """Frozen dataclass: callers cannot mutate a shared result in flight."""
    result = _sample()
    try:
        result.width = 99  # type: ignore[misc]
    except AttributeError:
        return
    raise AssertionError("OperationResult must be frozen")
