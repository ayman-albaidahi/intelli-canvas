import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    image = Image.new("RGB", (1, 1), (255, 0, 0))
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "saturation.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_saturation_processes_image_in_python():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/saturation", json={"image_id": image_id, "value": 0})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "saturation"
    assert payload["image"]["value"] == 0

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    red, green, blue = result.getpixel((0, 0))
    assert red == green == blue


def test_saturation_rejects_out_of_range_value():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/saturation", json={"image_id": image_id, "value": 201})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_SATURATION"
