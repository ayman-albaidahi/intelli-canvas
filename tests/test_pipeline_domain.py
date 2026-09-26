"""Guards the public/private split enforced by Pipeline and PipelineNode.

``pipeline_id`` is a server-side primary key: clients address a pipeline
through its image session, so it must not appear in the serialized view.
``to_storage_dict`` is the exception — it is the repository round-trip view
and deliberately keeps ``created_at``, because ``save_pipeline`` writes that
column straight back and ``NOT NULL`` rejects a node that has lost it.
"""

from backend.app.domain.pipeline import Pipeline, PipelineNode


def _node() -> PipelineNode:
    return PipelineNode(
        id="node_1",
        operation="brightness",
        parameters={"value": 120},
        enabled=True,
        order=2,
        created_at=1_700_000_000,
        updated_at=1_700_000_500,
    )


def _pipeline() -> Pipeline:
    return Pipeline(
        pipeline_id="abc123",
        image_id="img1",
        version=3,
        created_at=1_700_000_000,
        updated_at=1_700_000_500,
        nodes=(_node(),),
    )


def test_public_view_omits_pipeline_id():
    assert "pipeline_id" not in _pipeline().to_public_dict()


def test_public_view_omits_row_timestamps_from_nodes():
    public = _node().to_public_dict()
    assert "created_at" not in public
    assert "updated_at" not in public


def test_public_view_exposes_the_client_contract():
    assert _pipeline().to_public_dict() == {
        "image_id": "img1",
        "version": 3,
        "created_at": 1_700_000_000,
        "updated_at": 1_700_000_500,
        "nodes": [
            {
                "id": "node_1",
                "operation": "brightness",
                "parameters": {"value": 120},
                "enabled": True,
                "order": 2,
            }
        ],
    }


def test_storage_view_carries_created_at_for_the_round_trip():
    assert _node().to_storage_dict()["created_at"] == 1_700_000_000


def test_storage_view_still_omits_updated_at():
    # The repository stamps updated_at on write; carrying a stale value would
    # let a patch claim it was never applied.
    assert "updated_at" not in _node().to_storage_dict()


def test_nodes_default_to_empty_tuple_and_are_not_shared():
    empty = Pipeline(pipeline_id=None, image_id="img1")
    assert empty.nodes == ()
    assert empty.to_public_dict()["nodes"] == []


def test_pipeline_is_immutable():
    pipeline = _pipeline()
    try:
        pipeline.version = 4
    except AttributeError:
        return
    raise AssertionError("Pipeline should be frozen")
