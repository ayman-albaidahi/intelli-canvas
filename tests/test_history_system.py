import io

from PIL import Image

from backend.app import create_app


def _setup(client, pixels=((255, 0, 0), (0, 0, 255))):
    image = Image.new("RGB", (2, 1))
    image.putdata([tuple(p) for p in pixels])
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    uploaded = client.post(
        "/api/images",
        data={"file": (source, "history.png")},
        content_type="multipart/form-data",
    )
    return uploaded.get_json()["image"]["image_id"]


def test_operations_are_recorded_in_history():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client)

    client.post("/api/process/grayscale", json={"image_id": image_id})
    client.post("/api/process/brightness", json={"image_id": image_id, "value": 130})

    history = client.get(f"/api/history?image_id={image_id}")
    assert history.status_code == 200
    payload = history.get_json()["image"]
    assert payload["total"] == 3
    assert [entry["operation"] for entry in payload["entries"]] == [
        "Upload",
        "Grayscale",
        "Brightness 130%",
    ]
    assert payload["entries"][2]["current"] is True


def test_undo_restores_previous_state():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client, pixels=((255, 0, 0),))

    client.post("/api/process/grayscale", json={"image_id": image_id})
    undone = client.post("/api/history/undo", json={"image_id": image_id})

    assert undone.status_code == 200
    assert undone.get_json()["image"]["index"] == 0

    content = client.get(f"/api/images/{image_id}/content")
    pixel = Image.open(io.BytesIO(content.data)).convert("RGB").getpixel((0, 0))
    assert pixel == (255, 0, 0)


def test_redo_reapplies_operation():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client, pixels=((255, 0, 0),))

    client.post("/api/process/grayscale", json={"image_id": image_id})
    client.post("/api/history/undo", json={"image_id": image_id})
    redone = client.post("/api/history/redo", json={"image_id": image_id})

    assert redone.status_code == 200
    assert redone.get_json()["image"]["index"] == 1

    content = client.get(f"/api/images/{image_id}/content")
    pixel = Image.open(io.BytesIO(content.data)).convert("RGB").getpixel((0, 0))
    assert pixel[0] == pixel[1] == pixel[2]


def test_goto_jumps_to_specific_step():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client, pixels=((255, 0, 0),))

    client.post("/api/process/grayscale", json={"image_id": image_id})
    client.post("/api/process/brightness", json={"image_id": image_id, "value": 140})
    gone = client.post("/api/history/goto", json={"image_id": image_id, "index": 1})

    assert gone.status_code == 200
    assert gone.get_json()["image"]["index"] == 1

    content = client.get(f"/api/images/{image_id}/content")
    pixel = Image.open(io.BytesIO(content.data)).convert("RGB").getpixel((0, 0))
    assert pixel[0] == pixel[1] == pixel[2]


def test_goto_rejects_out_of_range_index():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client)

    response = client.post("/api/history/goto", json={"image_id": image_id, "index": 9})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "HISTORY_INDEX_INVALID"


def test_undo_without_history_is_rejected():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client)

    response = client.post("/api/history/undo", json={"image_id": image_id})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "NOTHING_TO_UNDO"


def test_clear_history_keeps_current_only():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client)

    client.post("/api/process/grayscale", json={"image_id": image_id})
    cleared = client.post("/api/history/clear", json={"image_id": image_id})

    assert cleared.status_code == 200
    payload = cleared.get_json()["image"]
    assert payload["total"] == 1
    assert payload["entries"][0]["operation"] == "Current state"


def test_clear_then_goto_zero_restores_processed_state():
    app = create_app()
    client = app.test_client()
    image_id = _setup(client, pixels=((255, 0, 0),))

    client.post("/api/process/grayscale", json={"image_id": image_id})
    client.post("/api/history/clear", json={"image_id": image_id})
    gone = client.post("/api/history/goto", json={"image_id": image_id, "index": 0})

    assert gone.status_code == 200
    content = client.get(f"/api/images/{image_id}/content")
    assert content.status_code == 200
    pixel = Image.open(io.BytesIO(content.data)).convert("RGB").getpixel((0, 0))
    assert pixel[0] == pixel[1] == pixel[2]


def test_history_requires_known_session():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/history?image_id=ghost")

    assert response.status_code == 404
