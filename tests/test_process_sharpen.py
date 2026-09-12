import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    image = Image.new("RGB", (3, 1))
    image.putdata([(50, 50, 50), (100, 100, 100), (150, 150, 150)])
    image.save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "sharpen.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_sharpen_processes_image_in_python():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/sharpen", json={"image_id": image_id, "value": 5})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "sharpen"
    assert payload["image"]["value"] == 5
    assert payload["image"]["width"] == 3
    assert payload["image"]["height"] == 1

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data))
    assert result.size == (3, 1)


def test_sharpen_rejects_out_of_range_value():
    client = create_app().test_client()
    image_id = _upload(client)

    response = client.post("/api/process/sharpen", json={"image_id": image_id, "value": 6})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_SHARPEN"
