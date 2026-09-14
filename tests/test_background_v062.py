import io

from PIL import Image

from backend.app import create_app
from backend.app.services.file_service import FileStorageService


def test_background_catalog_contains_category_and_thumbnail(tmp_path):
    app = create_app()
    app.config["FILE_STORAGE_SERVICE"] = FileStorageService(storage_root=tmp_path / "storage")
    client = app.test_client()
    source = io.BytesIO()
    Image.new("RGB", (640, 360), (20, 90, 180)).save(source, format="JPEG")
    source.seek(0)

    uploaded = client.post(
        "/api/background/backgrounds",
        data={"file": (source, "product-blue.jpg"), "category": "product"},
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 200
    name = uploaded.get_json()["background"]

    catalog = client.get("/api/background/backgrounds/catalog")
    assert catalog.status_code == 200
    item = next(entry for entry in catalog.get_json()["backgrounds"] if entry["name"] == name)
    assert item["category"] == "product"
    assert item["width"] == 640
    assert item["height"] == 360
    assert item["thumbnail_url"].endswith("/thumbnail")

    thumbnail = client.get(item["thumbnail_url"])
    assert thumbnail.status_code == 200
    assert thumbnail.mimetype == "image/jpeg"
    preview = Image.open(io.BytesIO(thumbnail.data))
    assert preview.size == (320, 200)


def test_background_upload_rejects_unknown_category(tmp_path):
    app = create_app()
    app.config["FILE_STORAGE_SERVICE"] = FileStorageService(storage_root=tmp_path / "storage")
    client = app.test_client()
    source = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(source, format="PNG")
    source.seek(0)

    response = client.post(
        "/api/background/backgrounds",
        data={"file": (source, "unknown.png"), "category": "unknown"},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_BACKGROUND_CATEGORY"
