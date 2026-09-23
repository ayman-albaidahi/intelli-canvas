import io
import time

import pytest
from auth_helpers import legacy_owner_id
from PIL import Image, ImageDraw

from backend.app import create_app
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def smart_crop_context(tmp_path):
    storage_root = tmp_path / "storage"
    app = create_app(
        database_path=str(tmp_path / "sessions.sqlite3"), storage_root=storage_root
    )
    storage_service = FileStorageService(storage_root=storage_root)

    image = Image.new("RGB", (1200, 800), (20, 20, 20))
    draw = ImageDraw.Draw(image)
    draw.rectangle((850, 180, 1130, 460), fill=(255, 240, 20))
    draw.ellipse((880, 210, 1100, 430), fill=(255, 60, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    source_path = storage_service.save_file(buffer, "salient.png")
    app.test_client()
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "salient.png",
            "stored_filename": source_path.name,
            "format": "png",
            "mime_type": "image/png",
            "size": source_path.stat().st_size,
        },
        owner_id=legacy_owner_id(app),
    )
    return app, storage_service, session, source_path


def post(app, path, image_id, **values):
    return app.test_client().post(path, json={"image_id": image_id, **values})


def test_preview_returns_crop_without_changing_history(smart_crop_context):
    app, storage, session, source_path = smart_crop_context
    before = app.config["IMAGE_SESSION_SERVICE"].history(session["image_id"])

    response = post(
        app,
        "/api/transform/smart-crop/preview",
        session["image_id"],
        aspect_ratio="1:1",
    )

    assert response.status_code == 200
    assert response.mimetype == "image/png"
    assert "width=" in response.headers["X-Smart-Crop"]
    assert app.config["IMAGE_SESSION_SERVICE"].history(session["image_id"]) == before
    assert source_path.exists()
    assert len(list(storage.processed_dir.iterdir())) == 1
    with Image.open(io.BytesIO(response.data)) as preview:
        assert preview.size[0] == preview.size[1]


def test_apply_returns_expected_ratio_and_records_history(smart_crop_context):
    app, _, session, _ = smart_crop_context

    response = post(
        app, "/api/transform/smart-crop/apply", session["image_id"], aspect_ratio="16:9"
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert result["width"] / result["height"] == pytest.approx(16 / 9, rel=0.01)
    assert result["width"] < 1200 or result["height"] < 800
    history = app.config["IMAGE_SESSION_SERVICE"].history(session["image_id"])
    assert history["entries"][-1]["operation"].startswith("Smart crop")
    assert history["entries"][-1]["parameters"]["aspect_ratio"] == "16:9"


def test_apply_integrates_with_undo_and_redo(smart_crop_context):
    app, _, session, _ = smart_crop_context
    client = app.test_client()

    applied = post(
        app, "/api/transform/smart-crop/apply", session["image_id"], aspect_ratio="1:1"
    )
    assert applied.status_code == 200
    cropped_filename = applied.get_json()["image"]["filename"]

    undo = client.post("/api/history/undo", json={"image_id": session["image_id"]})
    assert undo.status_code == 200
    assert undo.get_json()["image"]["index"] == 0
    assert undo.get_json()["image"]["current_filename"] != cropped_filename

    redo = client.post("/api/history/redo", json={"image_id": session["image_id"]})
    assert redo.status_code == 200
    assert redo.get_json()["image"]["index"] == 1
    assert redo.get_json()["image"]["current_filename"] == cropped_filename


def test_original_ratio_returns_full_image(smart_crop_context):
    app, _, session, _ = smart_crop_context

    response = post(
        app,
        "/api/transform/smart-crop/preview",
        session["image_id"],
        aspect_ratio="original",
    )

    assert response.status_code == 200
    with Image.open(io.BytesIO(response.data)) as preview:
        assert preview.size == (1200, 800)


@pytest.mark.parametrize(
    "aspect_ratio", ["0:1", "1:0", "bad", "1", "1:-1", "1001:1", ""]
)
def test_invalid_aspect_ratio_is_rejected(smart_crop_context, aspect_ratio):
    app, _, session, _ = smart_crop_context

    response = post(
        app,
        "/api/transform/smart-crop/preview",
        session["image_id"],
        aspect_ratio=aspect_ratio,
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_SMART_CROP"


def test_crop_is_always_inside_source_bounds(smart_crop_context):
    app, _, session, _ = smart_crop_context

    response = post(
        app, "/api/transform/smart-crop/apply", session["image_id"], aspect_ratio="9:16"
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert 0 <= result["x"] <= 1200 - result["width"]
    assert 0 <= result["y"] <= 800 - result["height"]
    assert result["width"] > 0
    assert result["height"] > 0


def test_missing_session_is_rejected(smart_crop_context):
    app, _, _, _ = smart_crop_context

    response = post(
        app, "/api/transform/smart-crop/apply", "missing-session", aspect_ratio="1:1"
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


def test_saliency_search_is_bounded_for_large_image(tmp_path):
    storage_root = tmp_path / "storage"
    app = create_app(
        database_path=str(tmp_path / "sessions.sqlite3"), storage_root=storage_root
    )
    storage_service = FileStorageService(storage_root=storage_root)
    image = Image.new("RGB", (4000, 3000), (80, 80, 80))
    draw = ImageDraw.Draw(image)
    draw.rectangle((2800, 1000, 3600, 1800), fill=(255, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    source_path = storage_service.save_file(buffer, "large.jpg")
    app.test_client()
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "large.jpg",
            "stored_filename": source_path.name,
            "format": "jpeg",
            "mime_type": "image/jpeg",
            "size": source_path.stat().st_size,
        },
        owner_id=legacy_owner_id(app),
    )

    started = time.perf_counter()
    response = post(
        app,
        "/api/transform/smart-crop/preview",
        session["image_id"],
        aspect_ratio="4:5",
    )
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    assert elapsed < 5.0
    with Image.open(io.BytesIO(response.data)) as preview:
        assert preview.size[0] / preview.size[1] == pytest.approx(4 / 5, rel=0.02)
