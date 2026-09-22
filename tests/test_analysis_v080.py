import io

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app


def _upload(client, image):
    source = io.BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    return client.post(
        "/api/images",
        data={"file": (source, "analysis-v080.png")},
        content_type="multipart/form-data",
    ).get_json()["image"]["image_id"]


def test_unified_analyzer_returns_quality_metrics_and_findings():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload(client, Image.new("RGB", (32, 24), (25, 25, 30)))
    response = client.post("/api/analysis", json={"image_id": image_id})
    assert response.status_code == 200
    report = response.get_json()
    assert report["analyzer_version"] == "0.8.0"
    assert 0 <= report["quality_score"] <= 100
    assert report["metrics"]["pixel_count"] == 768
    for key in (
        "brightness_median",
        "sharpness_score",
        "noise_score",
        "clipped_shadow_ratio",
        "clipped_highlight_ratio",
    ):
        assert key in report["metrics"]
    assert {finding["code"] for finding in report["findings"]} >= {
        "LOW_BRIGHTNESS",
        "LOW_CONTRAST",
        "LOW_SHARPNESS",
    }


def test_analysis_cache_hits_without_modifying_image_or_history():
    app = create_app()
    storage = app.config["FILE_STORAGE_SERVICE"]
    for cache_file in storage.resolve_storage_dir("analysis-cache").glob(
        "analysis-cache-*.json"
    ):
        cache_file.unlink()
    client = authenticated_client(app)
    image_id = _upload(client, Image.new("RGB", (24, 24), (140, 128, 150)))
    before_content = client.get(f"/api/images/{image_id}/content").data

    first = client.post("/api/analysis", json={"image_id": image_id})
    second = client.post("/api/analysis", json={"image_id": image_id})

    assert first.get_json()["cache_hit"] is False
    assert second.get_json()["cache_hit"] is True
    assert first.get_json()["analysis_hash"] == second.get_json()["analysis_hash"]
    assert client.get(f"/api/images/{image_id}/content").data == before_content
    assert (
        client.get(f"/api/history?image_id={image_id}").get_json()["image"]["total"]
        == 1
    )


def test_analysis_export_uses_unified_report():
    app = create_app()
    client = authenticated_client(app)
    image_id = _upload(client, Image.new("RGB", (16, 16), (255, 255, 255)))
    response = client.post("/api/analysis/export-report", json={"image_id": image_id})
    assert response.status_code == 200
    assert response.mimetype == "application/json"
    assert response.get_json()["analyzer_version"] == "0.8.0"
    assert "quality_score" in response.get_json()
