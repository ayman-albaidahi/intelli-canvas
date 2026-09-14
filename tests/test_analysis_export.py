import io
import json

from PIL import Image

from backend.app import create_app


def _upload_image(client):
    image = Image.new("RGB", (8, 8), (40, 50, 60))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    response = client.post(
        "/api/images",
        data={"file": (io.BytesIO(buffer.getvalue()), "export-report.png")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    return response.get_json()["image"]["image_id"]


def test_analysis_report_export_returns_json_attachment_without_mutating_history():
    app = create_app()
    client = app.test_client()
    image_id = _upload_image(client)

    response = client.post(
        "/api/analysis/export-report",
        json={"image_id": image_id},
    )

    assert response.status_code == 200
    assert response.mimetype == "application/json"
    assert response.headers["Content-Disposition"].startswith(
        "attachment; filename=analysis.json"
    )

    report = json.loads(response.data)
    assert report["success"] is True
    assert report["image_id"] == image_id
    assert "metrics" in report
    assert "findings" in report

    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["total"] == 1
