import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    Image.new("RGB", (32, 32), (25, 25, 30)).save(source, format="PNG")
    source.seek(0)
    return client.post("/api/images", data={"file": (source, "suggestions-v081.png")}, content_type="multipart/form-data").get_json()["image"]["image_id"]


def test_suggestions_return_multiple_explainable_pipeline_definitions():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    response = client.post("/api/suggestions", json={"image_id": image_id})
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload["suggestions"]) >= 3
    for suggestion in payload["suggestions"]:
        assert suggestion["rule_version"] == "0.8.1"
        assert 0 <= suggestion["confidence"] <= 1
        assert suggestion["evidence"]
        assert suggestion["pipeline"]["nodes"]
        assert suggestion["suggested_operation"]["label"]

    combined = next(item for item in payload["suggestions"] if item["type"] == "EXPOSURE_AND_CONTRAST")
    assert len(combined["pipeline"]["nodes"]) == 2
    assert combined["source_findings"] == ["LOW_BRIGHTNESS", "LOW_CONTRAST"]


def test_suggestion_pipeline_preview_is_read_only_and_apply_records_one_entry():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    before = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    suggestion_type = "EXPOSURE_AND_CONTRAST"

    preview = client.post("/api/suggestions/preview", json={"image_id": image_id, "type": suggestion_type})
    assert preview.status_code == 200
    assert preview.mimetype == "image/png"
    assert client.get(f"/api/history?image_id={image_id}").get_json()["image"]["total"] == before["total"]

    applied = client.post("/api/suggestions/apply", json={"image_id": image_id, "type": suggestion_type})
    assert applied.status_code == 200
    assert applied.get_json()["pipeline"]["nodes"]
    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["total"] == before["total"] + 1
    assert history["entries"][-1]["operation"] == "Apply pipeline"
    assert history["entries"][-1]["parameters"]["source"] == "smart-suggestion"
    assert history["entries"][-1]["parameters"]["suggestion_id"] == suggestion_type
