import io

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app


def _upload_solid(client, color, size=(4, 4), name="photo.png"):
    image = Image.new("RGB", size, color)
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    uploaded = client.post(
        "/api/images",
        data={"file": (source, name)},
        content_type="multipart/form-data",
    )
    return uploaded.get_json()["image"]["image_id"]


def _pixel(client, image_id, at=(0, 0)):
    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGBA")
    return result.getpixel(at)


def test_mask_preview_returns_png_mask():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    response = client.post(
        "/api/background/mask-preview",
        json={"image_id": image_id, "color": "#ff0000", "tolerance": 10},
    )

    assert response.status_code == 200
    assert response.mimetype == "image/png"
    mask = Image.open(io.BytesIO(response.data))
    assert mask.mode == "L"
    assert mask.getpixel((0, 0)) == 0


def test_remove_makes_key_color_transparent():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    processed = client.post(
        "/api/background/remove",
        json={"image_id": image_id, "color": "#ff0000", "tolerance": 10},
    )

    assert processed.status_code == 200
    payload = processed.get_json()
    assert payload["image"]["operation"] == "remove-background"
    assert "path" not in payload["image"]

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGBA")
    assert result.mode == "RGBA"
    assert result.getpixel((0, 0))[3] == 0


def test_invert_keeps_key_color_instead():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    processed = client.post(
        "/api/background/remove",
        json={
            "image_id": image_id,
            "color": "#ff0000",
            "tolerance": 10,
            "invert": True,
        },
    )

    assert processed.status_code == 200
    pixel = _pixel(client, image_id)
    assert pixel[:3] == (255, 0, 0)
    assert pixel[3] == 255


def test_replace_with_solid_color():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    processed = client.post(
        "/api/background/replace",
        json={
            "image_id": image_id,
            "color": "#ff0000",
            "tolerance": 10,
            "background_color": "#00ff00",
        },
    )

    assert processed.status_code == 200
    assert processed.get_json()["image"]["operation"] == "replace-background"

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((0, 0)) == (0, 255, 0)


def test_replace_with_library_background():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    backdrop = io.BytesIO()
    Image.new("RGB", (4, 4), (0, 0, 255)).save(backdrop, format="JPEG")
    backdrop.seek(0)
    uploaded = client.post(
        "/api/background/backgrounds",
        data={"file": (backdrop, "studio.jpg")},
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 200
    name = uploaded.get_json()["background"]

    listing = client.get("/api/background/backgrounds")
    assert name in listing.get_json()["backgrounds"]

    processed = client.post(
        "/api/background/replace",
        json={
            "image_id": image_id,
            "color": "#ff0000",
            "tolerance": 10,
            "background_name": name,
        },
    )

    assert processed.status_code == 200
    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    pixel = result.getpixel((0, 0))
    assert all(abs(pixel[i] - (0, 0, 255)[i]) <= 8 for i in range(3))


def test_remove_rejects_invalid_color():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    response = client.post(
        "/api/background/remove",
        json={"image_id": image_id, "color": "red", "tolerance": 10},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_MASK_PARAMS"


def test_remove_rejects_out_of_range_tolerance():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    response = client.post(
        "/api/background/remove",
        json={"image_id": image_id, "color": "#ff0000", "tolerance": 999},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_MASK_PARAMS"


def test_remove_rejects_unknown_session():
    app = create_app()
    client = authenticated_client(app)

    response = client.post(
        "/api/background/remove",
        json={"image_id": "missing", "color": "#ff0000"},
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


def test_replace_rejects_missing_target():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    response = client.post(
        "/api/background/replace",
        json={"image_id": image_id, "color": "#ff0000", "tolerance": 10},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_BACKGROUND_TARGET"


def test_replace_rejects_both_targets():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    response = client.post(
        "/api/background/replace",
        json={
            "image_id": image_id,
            "color": "#ff0000",
            "tolerance": 10,
            "background_color": "#00ff00",
            "background_name": "studio.jpg",
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_BACKGROUND_TARGET"


def test_upload_background_rejects_non_image():
    app = create_app()
    client = authenticated_client(app)

    response = client.post(
        "/api/background/backgrounds",
        data={"file": (io.BytesIO(b"not an image"), "backdrop.txt")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_FILE"


def test_chained_background_operations_keep_filenames_bounded():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload_solid(client, (255, 0, 0))

    for _ in range(5):
        processed = client.post(
            "/api/background/remove",
            json={"image_id": image_id, "color": "#ff0000", "tolerance": 10},
        )
        assert processed.status_code == 200
        assert len(processed.get_json()["image"]["filename"]) < 120

    content = client.get(f"/api/images/{image_id}/content")
    assert content.status_code == 200
