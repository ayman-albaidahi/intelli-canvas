from __future__ import annotations


def authenticated_client(app, email="owner@example.com"):
    client = app.test_client()
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct horse battery staple",
            "display_name": "Test Owner",
        },
    )
    assert response.status_code == 201
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": "correct horse battery staple",
        },
    )
    assert response.status_code == 200
    csrf_cookie = client.get_cookie(app.config["CSRF_COOKIE_NAME"])
    assert csrf_cookie is not None
    client.environ_base["HTTP_X_CSRF_TOKEN"] = csrf_cookie.value
    return client
