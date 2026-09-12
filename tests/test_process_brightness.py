import io

from PIL import Image

from backend.app import create_app


def _upload(client, color):
    source = io.BytesIO()
    Image.new("RGB", (1, 1), color).save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "brightness.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_brightness_processes_image_in_python():
    client = create_app().test_client()
    image_id = _upload(client, (100, 100, 100))

    response = client.post("/api/process/brightness", json={"image_id": image_id, "value": 150})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "brightness"
    assert payload["image"]["value"] == 150

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((0, 0)) == (150, 150, 150)


def test_brightness_rejects_out_of_range_value():
    client = create_app().test_client()
    image_id = _upload(client, (100, 100, 100))

    response = client.post("/api/process/brightness", json={"image_id": image_id, "value": 201})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_BRIGHTNESS"
