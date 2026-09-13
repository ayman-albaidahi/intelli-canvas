import io

from PIL import Image

from backend.app import create_app


def _upload(client, size=(8, 6), with_alpha=False):
    image = Image.new("RGBA" if with_alpha else "RGB", size, (255, 0, 0))
    if with_alpha:
        image.putalpha(0)
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    uploaded = client.post(
        "/api/images",
        data={"file": (source, "export.png")},
        content_type="multipart/form-data",
    )
    return uploaded.get_json()["image"]["image_id"]


def test_export_resizes_before_download():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": 4, "height": 3},
    )

    assert response.status_code == 200
    result = Image.open(io.BytesIO(response.data))
    assert result.size == (4, 3)


def test_export_resizes_by_width_only_keeping_ratio():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": 16},
    )

    assert response.status_code == 200
    result = Image.open(io.BytesIO(response.data))
    assert result.size == (16, 12)


def test_export_jpeg_quality_changes_bytes():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client, size=(200, 150))

    high = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "jpeg", "quality": 95},
    )
    low = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "jpeg", "quality": 30},
    )

    assert high.status_code == 200 and low.status_code == 200
    assert len(high.data) >= len(low.data)


def test_export_jpeg_flattens_transparency_to_white():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client, size=(4, 4), with_alpha=True)

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "jpeg"},
    )

    assert response.status_code == 200
    result = Image.open(io.BytesIO(response.data)).convert("RGB")
    pixel = result.getpixel((0, 0))
    assert all(channel >= 240 for channel in pixel)


def test_export_rejects_invalid_quality():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "jpeg", "quality": 500},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_QUALITY"


def test_export_rejects_invalid_dimensions():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/images/export",
        json={"image_id": image_id, "format": "png", "width": -3},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"
