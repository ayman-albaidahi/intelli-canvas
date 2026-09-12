import io

from PIL import Image

from backend.app import create_app


def test_grayscale_processes_current_session_with_pillow(tmp_path):
    image = Image.new("RGB", (2, 1))
    image.putdata([(255, 0, 0), (0, 255, 0)])
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)

    app = create_app()
    client = app.test_client()
    uploaded = client.post(
        "/api/images",
        data={"file": (source, "colors.png")},
        content_type="multipart/form-data",
    )
    image_id = uploaded.get_json()["image"]["image_id"]

    processed = client.post("/api/process/grayscale", json={"image_id": image_id})

    assert processed.status_code == 200
    payload = processed.get_json()
    assert payload["success"] is True
    assert payload["image"]["operation"] == "grayscale"
    assert payload["image"]["format"] == "png"

    content = client.get(f"/api/images/{image_id}/content")
    result = Image.open(io.BytesIO(content.data)).convert("RGB")
    assert result.getpixel((0, 0))[0] == result.getpixel((0, 0))[1] == result.getpixel((0, 0))[2]
