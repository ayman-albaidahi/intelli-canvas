import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    Image.new("RGB", (6, 4), (80, 20, 10)).save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "comparison.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def test_history_metadata_content_and_compare_are_read_only():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    processed = client.post(
        "/api/process/brightness", json={"image_id": image_id, "value": 130}
    )
    assert processed.status_code == 200
    before_history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]

    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["entries"][1]["parameters"]
    assert history["entries"][1]["index"] == 1

    content = client.get(f"/api/history/content/{image_id}/0")
    assert content.status_code == 200
    assert content.mimetype == "image/png"

    comparison = client.get(f"/api/history/compare?image_id={image_id}&from=0&to=1")
    assert comparison.status_code == 200
    payload = comparison.get_json()["comparison"]
    assert payload["from"]["index"] == 0
    assert payload["to"]["index"] == 1
    assert payload["same_dimensions"] is True
    assert payload["from"]["url"].endswith(f"/{image_id}/0")
    assert (
        client.get(f"/api/history?image_id={image_id}").get_json()["image"]
        == before_history
    )


def test_history_diff_returns_png_without_mutating_current_state():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    client.post("/api/process/brightness", json={"image_id": image_id, "value": 150})
    before = client.get(f"/api/images/{image_id}/content").data
    history_before = client.get(f"/api/history?image_id={image_id}").get_json()["image"]

    diff = client.post(
        "/api/history/diff",
        json={
            "image_id": image_id,
            "from_index": 0,
            "to_index": 1,
            "mode": "heatmap",
            "threshold": 5,
        },
    )

    assert diff.status_code == 200
    assert diff.mimetype == "image/png"
    assert Image.open(io.BytesIO(diff.data)).size == (6, 4)
    assert client.get(f"/api/images/{image_id}/content").data == before
    assert (
        client.get(f"/api/history?image_id={image_id}").get_json()["image"]
        == history_before
    )


def test_history_diff_rejects_mismatched_dimensions():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    client.post(
        "/api/transform/resize", json={"image_id": image_id, "width": 3, "height": 3}
    )

    diff = client.post(
        "/api/history/diff",
        json={"image_id": image_id, "from_index": 0, "to_index": 1},
    )

    assert diff.status_code == 400
    assert diff.get_json()["error"]["code"] == "HISTORY_DIFF_INVALID"
