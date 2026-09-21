"""Revision guards for mutating image endpoints.

A client quotes back the ``revision`` (history index) the backend handed it.
A request carrying an older revision was queued against a previous image
state, so applying it now would silently clobber a newer result.
"""

import io

from PIL import Image

from backend.app import create_app


def _upload(client, color=(100, 100, 100)):
    source = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(source, format="PNG")
    source.seek(0)
    response = client.post(
        "/api/images",
        data={"file": (source, "revision.png")},
        content_type="multipart/form-data",
    )
    return response.get_json()["image"]["image_id"]


def _process(client, image_id, value, source_revision=None):
    payload = {"image_id": image_id, "value": value}
    if source_revision is not None:
        payload["source_revision"] = source_revision
    return client.post("/api/process/brightness", json=payload)


def test_operation_returns_monotonic_revision():
    client = create_app().test_client()
    image_id = _upload(client)

    first = client.post(
        "/api/process/brightness", json={"image_id": image_id, "value": 130}
    ).get_json()
    second = client.post(
        "/api/process/brightness", json={"image_id": image_id, "value": 150}
    ).get_json()

    assert first["image"]["revision"] == 1
    assert second["image"]["revision"] == 2


def test_stale_revision_is_rejected():
    client = create_app().test_client()
    image_id = _upload(client)

    first = _process(client, image_id, 130)
    assert first.status_code == 200

    # Quote the pre-operation revision: this request was queued before the
    # first operation landed, so it must not clobber the newer image.
    stale = _process(client, image_id, 140, source_revision=0)

    assert stale.status_code == 409
    assert stale.get_json()["error"]["code"] == "STALE_IMAGE_REVISION"


def test_current_revision_is_accepted():
    client = create_app().test_client()
    image_id = _upload(client)

    first = _process(client, image_id, 130)
    revision = first.get_json()["image"]["revision"]

    second = _process(client, image_id, 140, source_revision=revision)

    assert second.status_code == 200
    assert second.get_json()["image"]["revision"] == revision + 1


def test_revision_guard_is_optional():
    """Omitting source_revision keeps the historic behaviour working."""
    client = create_app().test_client()
    image_id = _upload(client)

    response = _process(client, image_id, 130)

    assert response.status_code == 200


def test_unknown_revision_is_rejected():
    """A revision that never existed is still stale."""
    client = create_app().test_client()
    image_id = _upload(client)

    response = _process(client, image_id, 130, source_revision=42)

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "STALE_IMAGE_REVISION"


def test_revision_guard_survives_multiple_operations():
    client = create_app().test_client()
    image_id = _upload(client)

    revision = None
    for value in (120, 140, 160):
        response = _process(client, image_id, value, source_revision=revision)
        assert response.status_code == 200
        revision = response.get_json()["image"]["revision"]

    # A request quoting the very first state is now doubly stale.
    stale = _process(client, image_id, 180, source_revision=1)
    assert stale.status_code == 409


def test_rejected_request_does_not_advance_history():
    """A stale rejection must leave the image and its revision untouched."""
    client = create_app().test_client()
    image_id = _upload(client)

    first = _process(client, image_id, 130)
    revision = first.get_json()["image"]["revision"]
    _process(client, image_id, 140, source_revision=0)

    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["index"] == revision

    # The valid request still lands on the next index.
    retry = _process(client, image_id, 140, source_revision=revision)
    assert retry.status_code == 200
    assert retry.get_json()["image"]["revision"] == revision + 1


# --- Race conditions -----------------------------------------------------
# The guard's reason for existing: a user fires two operations from the same
# rendered state (a double-click, or a slow request still in flight when the
# second click lands). Exactly one may win, and the loser must be told its
# revision is stale rather than silently overwriting the winner.


def test_duplicate_submit_from_the_same_revision_loses_once():
    client = create_app().test_client()
    image_id = _upload(client)

    # Both requests quote revision 0, the state the client actually rendered.
    winner = _process(client, image_id, 130, source_revision=0)
    loser = _process(client, image_id, 140, source_revision=0)

    assert winner.status_code == 200
    assert loser.status_code == 409
    assert loser.get_json()["error"]["code"] == "STALE_IMAGE_REVISION"

    # The winner's value is the one that survives; history grew by exactly one.
    history = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert history["total"] == 2
    assert history["entries"][-1]["parameters"]["value"] == 130


def test_out_of_order_arrival_cannot_clobber_the_newer_result():
    """The network reordering case: the second response lands first."""
    client = create_app().test_client()
    image_id = _upload(client)

    first = _process(client, image_id, 130, source_revision=0)
    assert first.status_code == 200
    newest_revision = first.get_json()["image"]["revision"]

    # A request that the client fired against revision 0 but which arrives
    # after the first one already advanced the session.
    late = _process(client, image_id, 140, source_revision=0)

    assert late.status_code == 409
    assert (
        client.get(f"/api/history?image_id={image_id}").get_json()["image"]["index"]
        == newest_revision
    )


# --- Undo / redo rebasing -------------------------------------------------
# Undo moves the history pointer without appending, which lowers the revision a
# client must quote. The guard has to follow the pointer, not the high-water
# mark, or undoing then editing would be rejected as stale.


def _undo(client, image_id):
    return client.post("/api/history/undo", json={"image_id": image_id})


def _redo(client, image_id):
    return client.post("/api/history/redo", json={"image_id": image_id})


def test_undo_lowers_the_revision_a_client_must_quote():
    client = create_app().test_client()
    image_id = _upload(client)

    first = _process(client, image_id, 130, source_revision=0)
    second = _process(
        client, image_id, 140, source_revision=first.get_json()["image"]["revision"]
    )
    second_revision = second.get_json()["image"]["revision"]

    assert _undo(client, image_id).status_code == 200
    after_undo = client.get(f"/api/history?image_id={image_id}").get_json()["image"]
    assert after_undo["index"] == second_revision - 1

    # Quoting the pre-undo revision is now stale; quoting the undone state is
    # accepted and continues from there.
    stale = _process(client, image_id, 150, source_revision=second_revision)
    assert stale.status_code == 409

    fresh = _process(client, image_id, 150, source_revision=after_undo["index"])
    assert fresh.status_code == 200


def test_redo_restores_the_revision_a_client_must_quote():
    client = create_app().test_client()
    image_id = _upload(client)

    _process(client, image_id, 130, source_revision=0)
    _process(client, image_id, 140, source_revision=1)
    assert _undo(client, image_id).status_code == 200
    assert _redo(client, image_id).status_code == 200

    index = client.get(f"/api/history?image_id={image_id}").get_json()["image"]["index"]
    assert index == 2

    # The redo put the pointer back, so the undone revision is current again.
    assert _process(client, image_id, 150, source_revision=index).status_code == 200
