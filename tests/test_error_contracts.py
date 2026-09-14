from backend.app import create_app
from backend.app.errors import InvalidRequestError


def test_invalid_analysis_request_uses_common_error_shape():
    app = create_app()
    client = app.test_client()

    response = client.post("/api/analysis", json={"image_id": ""})

    assert response.status_code == 400
    assert response.get_json() == {
        "success": False,
        "error": {
            "code": "INVALID_IMAGE_ID",
            "message": "A valid image_id is required.",
        },
    }


def test_not_implemented_route_uses_common_error_shape():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/pipeline")

    assert response.status_code == 501
    assert response.get_json() == {
        "success": False,
        "error": {
            "code": "NOT_IMPLEMENTED",
            "message": "Pipeline management is not implemented yet.",
        },
    }


def test_application_error_handler_returns_safe_json():
    app = create_app()

    @app.get("/_test/application-error")
    def application_error_route():
        raise InvalidRequestError("A controlled test error.")

    response = app.test_client().get("/_test/application-error")

    assert response.status_code == 400
    assert response.get_json() == {
        "success": False,
        "error": {
            "code": "INVALID_REQUEST",
            "message": "A controlled test error.",
        },
    }


def test_unexpected_error_handler_hides_internal_details():
    app = create_app()

    @app.get("/_test/unexpected-error")
    def unexpected_error_route():
        raise RuntimeError("secret implementation detail")

    response = app.test_client().get("/_test/unexpected-error")

    assert response.status_code == 500
    assert response.get_json() == {
        "success": False,
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected server error occurred.",
        },
    }
