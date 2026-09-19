import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    image = Image.new("RGB", (2, 1))
    image.putdata([(50, 50, 50), (150, 150, 150)])
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "contrast.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_contrast_processes_image_in_python():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/process/contrast", json={"image_id": image_id, "value": 200}
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "contrast"
    assert payload["image"]["value"] == 200

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((0, 0)) == (0, 0, 0)
    assert result.getpixel((1, 0)) == (200, 200, 200)


def test_contrast_rejects_out_of_range_value():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post(
        "/api/process/contrast", json={"image_id": image_id, "value": -1}
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_CONTRAST"
