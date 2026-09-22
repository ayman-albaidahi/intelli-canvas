import io
import sqlite3
import time

from auth_helpers import authenticated_client
from PIL import Image

from backend.app import create_app
from backend.app.database import (
    SYSTEM_OWNER_EMAIL,
    SYSTEM_OWNER_USER_ID,
    SQLiteSessionRepository,
)


def _png_bytes():
    image = Image.new("RGB", (4, 4), (120, 60, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client, filename="sample.png", project_id=None, owner_id=None):
    data = {"file": (io.BytesIO(_png_bytes()), filename)}
    if project_id is not None:
        data["project_id"] = project_id
    if owner_id is not None:
        data["owner_id"] = owner_id
    return client.post("/api/images", data=data, content_type="multipart/form-data")


def test_new_upload_creates_project_owned_by_authenticated_user():
    app = create_app(":memory:")
    client = authenticated_client(app, "owner-a@example.com")

    response = _upload(client)

    assert response.status_code == 200
    image_id = response.get_json()["image"]["image_id"]
    session = app.config["IMAGE_SESSIONS"].get_session(image_id)
    owner = app.config["IMAGE_SESSIONS"].get_user_by_email("owner-a@example.com")
    project = app.config["IMAGE_SESSIONS"].get_project(session["project_id"])
    assert project["owner_id"] == owner["user_id"]


def test_upload_rejects_project_owned_by_another_user():
    app = create_app(":memory:")
    owner_client = authenticated_client(app, "owner-a@example.com")
    other_client = authenticated_client(app, "owner-b@example.com")

    created = _upload(owner_client)
    image_id = created.get_json()["image"]["image_id"]
    project_id = app.config["IMAGE_SESSIONS"].get_session(image_id)["project_id"]

    response = _upload(other_client, "cross-owner.png", project_id=project_id)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert app.config["IMAGE_SESSIONS"].count() == 1


def test_client_cannot_spoof_project_owner_id():
    app = create_app(":memory:")
    client = authenticated_client(app, "owner-a@example.com")
    forged_owner_id = app.config["IMAGE_SESSIONS"].get_user_by_email(
        SYSTEM_OWNER_EMAIL
    )["user_id"]

    response = _upload(client, owner_id=forged_owner_id)

    assert response.status_code == 200
    image_id = response.get_json()["image"]["image_id"]
    session = app.config["IMAGE_SESSIONS"].get_session(image_id)
    project = app.config["IMAGE_SESSIONS"].get_project(session["project_id"])
    owner = app.config["IMAGE_SESSIONS"].get_user_by_email("owner-a@example.com")
    assert project["owner_id"] == owner["user_id"]
    assert project["owner_id"] != forged_owner_id


def test_anonymous_upload_cannot_create_an_unowned_project():
    client = create_app(":memory:").test_client()

    response = _upload(client)

    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTH_REQUIRED"


def test_repository_owner_resolvers_hide_other_users_resources():
    app = create_app(":memory:")
    client = authenticated_client(app, "owner-a@example.com")
    _upload(client)
    repository = app.config["IMAGE_SESSIONS"]
    image_id = repository.list_ids()[0]
    owner_a = repository.get_user_by_email("owner-a@example.com")["user_id"]
    owner_b = repository.create_user(
        {
            "user_id": "owner-b-id",
            "email": "owner-b@example.com",
            "password_hash": "!test!",
            "display_name": "Owner B",
            "is_active": True,
            "created_at": int(time.time()),
            "updated_at": int(time.time()),
        }
    )["user_id"]
    project_id = repository.get_session(image_id)["project_id"]

    assert repository.get_project_for_owner(project_id, owner_a) is not None
    assert repository.get_project_for_owner(project_id, owner_b) is None
    assert repository.get_session_for_owner(image_id, owner_a) is not None
    assert repository.get_session_for_owner(image_id, owner_b) is None
    assert repository.get_layers_for_owner(image_id, owner_b) is None
    assert repository.get_pipeline_for_owner(image_id, owner_b) is None


def test_legacy_projects_are_migrated_to_inactive_system_owner(tmp_path):
    database_path = tmp_path / "legacy.sqlite3"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE users (
            user_id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE projects (
            project_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        INSERT INTO projects VALUES ('legacy-project', 'Legacy', 1, 1);
        """
    )
    connection.commit()
    connection.close()

    repository = SQLiteSessionRepository(database_path)

    project = repository.get_project("legacy-project")
    system_user = repository.get_user(SYSTEM_OWNER_USER_ID)
    assert project["owner_id"] == SYSTEM_OWNER_USER_ID
    assert system_user["email"] == SYSTEM_OWNER_EMAIL
    assert system_user["is_active"] == 0
    assert repository.get_project_for_owner("legacy-project", "random-user") is None
    assert (
        repository.get_project_for_owner("legacy-project", SYSTEM_OWNER_USER_ID)
        is not None
    )

    with repository._connect() as connection:
        owner_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(projects)")
        }
        foreign_keys = connection.execute(
            "PRAGMA foreign_key_list(projects)"
        ).fetchall()
    assert owner_columns["owner_id"][3] == 1
    assert any(row[2] == "users" and row[3] == "owner_id" for row in foreign_keys)
