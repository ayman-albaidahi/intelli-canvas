import io

from PIL import Image

from backend.app import create_app


def _upload(client):
    source = io.BytesIO()
    Image.new("RGB", (24, 24), (25, 25, 30)).save(source, format="PNG")
    source.seek(0)
    return client.post("/api/images", data={"file": (source, "explain-v082.png")}, content_type="multipart/form-data").get_json()["image"]["image_id"]


def test_explain_operation_describes_parameters_and_source():
    app = create_app()
    client = app.test_client()
    response = client.post("/api/explain-operation", json={"operation": "brightness", "parameters": {"value": 130}, "source": {"kind": "smart-suggestion", "suggestion_id": "BRIGHTNESS_BOOST"}})
    assert response.status_code == 200
    explanation = response.get_json()["explanation"]
    assert explanation["title"] == "Brightness correction"
    assert explanation["parameters"] == {"value": 130}
    assert "value" in explanation["parameter_explanations"]
    assert explanation["source"]["suggestion_id"] == "BRIGHTNESS_BOOST"


def test_explain_operation_can_explain_a_finding():
    app = create_app()
    client = app.test_client()
    finding = {"code": "LOW_BRIGHTNESS", "severity": "high", "evidence": {"brightness_mean": 25, "target_range": [110, 180]}}
    response = client.post("/api/explain-operation", json={"operation": "brightness", "parameters": {"value": 130}, "finding": finding})
    assert response.status_code == 200
    explanation = response.get_json()["explanation"]
    assert explanation["finding"]["title"] == "Low brightness"
    assert explanation["finding"]["evidence"]["brightness_mean"] == 25
    assert explanation["reason"]


def test_analysis_and_suggestions_expose_explainable_evidence():
    app = create_app()
    client = app.test_client()
    image_id = _upload(client)
    report = client.post("/api/analysis", json={"image_id": image_id}).get_json()
    assert report["findings"]
    assert all(item["title"] and item["explanation"] and item["evidence"] is not None for item in report["findings"])
    suggestions = client.post("/api/suggestions", json={"image_id": image_id}).get_json()["suggestions"]
    assert suggestions
    assert all(item["source_findings"] and item["rule_version"] for item in suggestions)


def test_explain_operation_rejects_invalid_parameters():
    app = create_app()
    client = app.test_client()
    response = client.post("/api/explain-operation", json={"operation": "median-filter", "parameters": {"ksize": 4}})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_OPERATION"
