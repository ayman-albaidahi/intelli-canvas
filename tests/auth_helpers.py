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
    return client
