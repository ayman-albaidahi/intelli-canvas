import io

import pytest
from PIL import Image

from backend.app import create_app
from backend.app.routes import images
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def export_context(tmp_path, monkeypatch):
    app = create_app()
    storage_service = FileStorageService(storage_root=tmp_path / "storage")
    monkeypatch.setattr(
        images, "FileStorageService", lambda: storage_service
    )

    source = Image.new("RGB", (4, 3), color="red")
    source_buffer = io.BytesIO()
    source.save(source_buffer, format="PNG")
    source_buffer.seek(0)
    source_path = storage_service.save_file(source_buffer, "source.png")
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "source.png",
            "stored_filename": source_path.name,
            "format": "png",
            "mime_type": "image/png",
            "size": source_path.stat().st_size,
        }
    )
    return app, storage_service, session, source_path


@pytest.mark.parametrize(
    "target_format, expected_mime, expected_pillow_format",
    [
        ("png", "image/png", "PNG"),
        ("jpeg", "image/jpeg", "JPEG"),
        ("webp", "image/webp", "WEBP"),
    ],
)
def test_export_returns_downloadable_image(
    export_context, target_format, expected_mime, expected_pillow_format
):
    app, _, session, _ = export_context

    response = app.test_client().post(
        "/api/images/export",
        json={"image_id": session["image_id"], "format": target_format},
    )

    assert response.status_code == 200
    assert response.mimetype == expected_mime
    disposition = response.headers["Content-Disposition"]
    assert disposition.startswith("attachment; filename=source_")
    assert disposition.endswith(
        ".jpg" if target_format == "jpeg" else f".{target_format}"
    )
    with Image.open(io.BytesIO(response.data)) as exported:
        assert exported.size == (4, 3)
        assert exported.format == expected_pillow_format


def test_export_does_not_change_session_or_original(export_context):
    app, storage_service, session, source_path = export_context
    original_bytes = source_path.read_bytes()
    original_session = dict(session)

    response = app.test_client().post(
        "/api/images/export",
        json={"image_id": session["image_id"], "format": "webp"},
    )

    assert response.status_code == 200
    assert source_path.read_bytes() == original_bytes
    assert app.config["IMAGE_SESSION_SERVICE"].get_session(
        session["image_id"]
    ) == original_session
    assert len(list(storage_service.processed_dir.iterdir())) == 1


@pytest.mark.parametrize(
    "payload, expected_code",
    [
        ({"format": "png"}, "INVALID_IMAGE_ID"),
        ({"image_id": "missing", "format": "png"}, "IMAGE_SESSION_NOT_FOUND"),
        ({"image_id": "valid", "format": "gif"}, "EXPORT_FAILED"),
    ],
)
def test_export_invalid_request_is_rejected(
    export_context, payload, expected_code
):
    app, _, session, _ = export_context
    if payload.get("image_id") == "valid":
        payload["image_id"] = session["image_id"]

    response = app.test_client().post(
        "/api/images/export", json=payload
    )

    assert response.status_code in {400, 404}
    assert response.get_json()["error"]["code"] == expected_code


def test_export_missing_source_is_rejected(export_context):
    app, _, session, source_path = export_context
    source_path.unlink()

    response = app.test_client().post(
        "/api/images/export",
        json={"image_id": session["image_id"], "format": "png"},
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_NOT_AVAILABLE"


def test_export_failure_returns_json_error(export_context, monkeypatch):
    app, _, session, _ = export_context

    def fail_convert(*args, **kwargs):
        raise OSError("conversion failed")

    monkeypatch.setattr(images.ImageIOService, "convert", fail_convert)
    response = app.test_client().post(
        "/api/images/export",
        json={"image_id": session["image_id"], "format": "png"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "EXPORT_FAILED"


def test_export_does_not_modify_conversion_endpoint(export_context):
    app, _, session, _ = export_context

    response = app.test_client().post(
        "/api/images/convert",
        json={"image_id": session["image_id"], "format": "webp"},
    )

    assert response.status_code == 200
    assert response.get_json()["image"]["format"] == "webp"


def test_export_composites_persisted_image_layer_without_changing_history(export_context):
    app, storage_service, session, _ = export_context
    app.config["LAYER_COMPOSITOR_SERVICE"].storage_service = storage_service
    layer_image = Image.new("RGBA", (2, 2), (0, 0, 255, 255))
    layer_buffer = io.BytesIO()
    layer_image.save(layer_buffer, format="PNG")
    layer_buffer.seek(0)
    layer_path = storage_service.save_file(layer_buffer, "layer.png", destination="layer-assets")
    asset = app.config["IMAGE_SESSIONS"].create_asset({
        "asset_id": "asset-blue",
        "image_id": session["image_id"],
        "storage_category": "layer-assets",
        "stored_filename": layer_path.name,
        "mime_type": "image/png",
        "size": layer_path.stat().st_size,
        "created_at": 1,
    })
    app.config["IMAGE_SESSION_SERVICE"].save_layers(session["image_id"], [{
        "id": "o1", "type": "image", "asset_id": asset["asset_id"],
        "x": 0, "y": 0, "w": 2, "h": 2, "opacity": 1, "rotation": 0,
        "visible": True, "blend": "source-over",
    }])

    response = app.test_client().post("/api/images/export", json={
        "image_id": session["image_id"], "format": "png", "composite_layers": True,
    })

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.data)).convert("RGBA") as exported:
        assert exported.getpixel((0, 0))[:3] == (0, 0, 255)
    assert app.config["IMAGE_SESSION_SERVICE"].history(session["image_id"])["total"] == 1
