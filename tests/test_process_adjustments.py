import io

import pytest
from PIL import Image

from backend.app import create_app


def _upload_png(client, pixels=None, size=(2, 1), name="colors.png"):
    image = Image.new("RGB", size)
    if pixels is not None:
        image.putdata(pixels)
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    uploaded = client.post(
        "/api/images",
        data={"file": (source, name)},
        content_type="multipart/form-data",
    )
    return uploaded.get_json()["image"]["image_id"]


@pytest.mark.parametrize(
    "operation,value",
    [
        ("brightness", 150),
        ("contrast", 60),
        ("saturation", 0),
        ("sharpen", 2),
        ("blur", 3),
    ],
)
def test_adjustment_processes_current_session(operation, value):
    app = create_app()
    client = app.test_client()
    image_id = _upload_png(client)

    processed = client.post(
        f"/api/process/{operation}",
        json={"image_id": image_id, "value": value},
    )

    assert processed.status_code == 200
    payload = processed.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == operation
    assert payload["image"]["format"] == "png"
    assert "path" not in payload["image"]

    content = client.get(f"/api/images/{image_id}/content")
    assert content.status_code == 200
    assert content.mimetype == "image/png"


def test_negative_inverts_pixel_colors():
    app = create_app()
    client = app.test_client()
    image_id = _upload_png(client, pixels=[(255, 0, 0)])

    processed = client.post("/api/process/negative", json={"image_id": image_id})

    assert processed.status_code == 200
    assert processed.get_json()["image"]["operation"] == "negative"

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((0, 0)) == (0, 255, 255)


def test_negative_rejects_unknown_session():
    app = create_app()
    client = app.test_client()

    response = client.post("/api/process/negative", json={"image_id": "missing"})

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


@pytest.mark.parametrize(
    "operation,payload,code",
    [
        ("brightness", {"value": 201}, "INVALID_BRIGHTNESS"),
        ("brightness", {"value": -1}, "INVALID_BRIGHTNESS"),
        ("brightness", {"value": 12.5}, "INVALID_BRIGHTNESS"),
        ("brightness", {"value": True}, "INVALID_BRIGHTNESS"),
        ("contrast", {"value": 999}, "INVALID_CONTRAST"),
        ("saturation", {"value": -5}, "INVALID_SATURATION"),
        ("sharpen", {"value": 6}, "INVALID_SHARPEN"),
        ("blur", {"value": 21}, "INVALID_BLUR"),
    ],
)
def test_adjustment_rejects_out_of_range_values(operation, payload, code):
    app = create_app()
    client = app.test_client()
    image_id = _upload_png(client)

    response = client.post(
        f"/api/process/{operation}",
        json={"image_id": image_id, **payload},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == code


def test_chained_operations_keep_filenames_bounded():
    app = create_app()
    client = app.test_client()
    image_id = _upload_png(client, size=(4, 4))

    for _ in range(6):
        processed = client.post("/api/process/grayscale", json={"image_id": image_id})
        assert processed.status_code == 200
        assert len(processed.get_json()["image"]["filename"]) < 120

    for operation, value in [
        ("brightness", 120),
        ("contrast", 80),
        ("negative", None),
        ("blur", 2),
        ("saturation", 150),
        ("sharpen", 3),
    ]:
        payload = {"image_id": image_id}
        if value is not None:
            payload["value"] = value
        processed = client.post(f"/api/process/{operation}", json=payload)
        assert processed.status_code == 200
        assert len(processed.get_json()["image"]["filename"]) < 120

    content = client.get(f"/api/images/{image_id}/content")
    assert content.status_code == 200
