import base64
import io

from PIL import Image

from backend.app import create_app
from backend.app.services.file_service import FileStorageService


def create_session(app, tmp_path, monkeypatch):
    storage = FileStorageService(storage_root=tmp_path / "storage")
    image = io.BytesIO()
    Image.new("RGB", (4, 4), "white").save(image, format="PNG")
    image.seek(0)
    path = storage.save_file(image, "layers.png")
    session = app.config["IMAGE_SESSION_SERVICE"].create_session({
        "original_filename": "layers.png",
        "stored_filename": path.name,
        "format": "png",
        "mime_type": "image/png",
        "size": path.stat().st_size,
    })
    return session


def test_layers_are_saved_and_restored_for_image_session(tmp_path):
    app = create_app()
    session = create_session(app, tmp_path, None)
    client = app.test_client()
    layers = [{
        "id": "o1",
        "type": "shape",
        "name": "Shape 1",
        "x": 10,
        "y": 20,
        "w": 30,
        "h": 40,
        "rotation": 0,
        "opacity": 1,
        "blend": "source-over",
        "visible": True,
        "locked": False,
        "shape": "rect",
        "fillOn": True,
        "fill": "#fff",
        "stroke": "#000",
        "strokeWidth": 3,
    }]

    saved = client.put("/api/layers", json={"image_id": session["image_id"], "layers": layers})
    assert saved.status_code == 200
    assert saved.get_json()["layers"] == layers

    restored = client.get(f"/api/layers?image_id={session['image_id']}")
    assert restored.status_code == 200
    assert restored.get_json()["layers"] == layers


def test_layers_reject_invalid_payload_and_unknown_session():
    app = create_app()
    client = app.test_client()

    invalid = client.put("/api/layers", json={"image_id": "missing", "layers": "nope"})
    assert invalid.status_code == 400
    assert invalid.get_json()["error"]["code"] == "INVALID_LAYERS"

    missing = client.get("/api/layers?image_id=missing")
    assert missing.status_code == 404
    assert missing.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


def test_image_layer_data_url_is_moved_to_file_storage(tmp_path):
    app = create_app()
    session = create_session(app, tmp_path, None)
    client = app.test_client()
    image = io.BytesIO()
    Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(image, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()

    response = client.put("/api/layers", json={
        "image_id": session["image_id"],
        "layers": [{"id": "o1", "type": "image", "src": data_url, "x": 0, "y": 0, "w": 2, "h": 2}],
    })

    assert response.status_code == 200
    saved = response.get_json()["layers"][0]
    assert saved["src"].startswith("/api/layers/assets/")
    assert saved["asset_id"]
    asset = client.get(saved["src"])
    assert asset.status_code == 200
    assert asset.mimetype == "image/png"
    assert asset.data.startswith(b"\x89PNG")
