import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    image = Image.new("RGB", (9, 1))
    image.putdata([(255, 255, 255)] + [(0, 0, 0)] * 8)
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "blur.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_blur_processes_image_in_python():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/blur", json={"image_id": image_id, "value": 2})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "blur"
    assert payload["image"]["value"] == 2

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((1, 0))[0] > 0
    assert result.getpixel((1, 0))[0] < 255


def test_blur_rejects_out_of_range_value():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/blur", json={"image_id": image_id, "value": 21})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_BLUR"
