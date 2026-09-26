"""A stored image processing pipeline and its nodes.

Pipelines are ordered lists of image operations applied as one unit. Nodes
are stored as rows in ``pipeline_nodes`` and reassembled by the repository;
before this type existed the repository handed back a hand-built nested dict
and every service that touched it reached in with subscripts
(``pipeline["nodes"]``, ``node["enabled"]``). Modeling the shape once means
the repository boundary is the only place that knows the column names.

``PipelineNode`` is frozen and hashable so a node can be used as a cache key
and compared by value; the cache-hash computation in
``PipelineExecutionService`` depends on that.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PipelineNode:
    """One operation in a pipeline."""

    id: str
    operation: str
    parameters: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    order: int = 0
    created_at: int | None = None
    updated_at: int | None = None

    def to_public_dict(self) -> dict[str, Any]:
        """The client view of this node.

        Timestamps are internal bookkeeping the UI recomputes from the
        pipeline's own ``updated_at``; keeping them out of the node view
        avoids leaking row-level metadata a client never requested.
        """
        return {
            "id": self.id,
            "operation": self.operation,
            "parameters": self.parameters,
            "enabled": self.enabled,
            "order": self.order,
        }

    def to_storage_dict(self) -> dict[str, Any]:
        """The repository round-trip view, including row bookkeeping.

        :meth:`save_pipeline` writes ``created_at`` straight back into the
        ``pipeline_nodes`` row it came from, so a patch that rewrites a node
        must carry the original timestamp through — ``NOT NULL`` rejects a
        node that has lost it. This view is for that boundary only; the
        client never sees it.
        """
        payload = self.to_public_dict()
        payload["created_at"] = self.created_at
        return payload


@dataclass(frozen=True)
class Pipeline:
    """A named pipeline attached to one image session."""

    pipeline_id: str | None
    image_id: str
    version: int = 1
    created_at: int | None = None
    updated_at: int | None = None
    nodes: tuple[PipelineNode, ...] = ()

    def to_public_dict(self) -> dict[str, Any]:
        """The client view of this pipeline.

        ``pipeline_id`` is a server-side primary key. Clients address a
        pipeline through its image session, so the id is not part of the
        public contract and is dropped here rather than filtered per route.
        """
        return {
            "image_id": self.image_id,
            "version": self.version,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "nodes": [node.to_public_dict() for node in self.nodes],
        }
