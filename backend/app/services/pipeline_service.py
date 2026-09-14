from __future__ import annotations

import re
import time
import uuid
from typing import Any

from .image_session_service import ImageSessionService

SUPPORTED_OPERATIONS = {
    "grayscale", "negative", "brightness", "contrast", "saturation", "gamma",
    "blur", "sharpen", "threshold", "sobel", "laplacian", "median-filter", "morphology",
}
NODE_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
MAX_NODES = 50


class PipelineParamError(ValueError):
    pass


class PipelineService:
    def __init__(self, session_service: ImageSessionService):
        self.session_service = session_service
        self.repository = session_service.repository

    def get(self, image_id: str) -> dict[str, Any]:
        if self.session_service.get_session(image_id) is None:
            raise FileNotFoundError("Image session was not found.")
        pipeline = self.repository.get_pipeline(image_id)
        if pipeline is not None:
            return pipeline
        return {"pipeline_id": None, "image_id": image_id, "version": 1, "created_at": None, "updated_at": None, "nodes": []}

    def save(self, image_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        nodes = self.validate_nodes(payload.get("nodes"))
        version = payload.get("version", 1)
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise PipelineParamError("version must be a positive integer.")
        return self.repository.save_pipeline(image_id, nodes, version, int(time.time()))

    def add(self, image_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        pipeline = self.get(image_id)
        nodes = list(pipeline["nodes"])
        nodes.append(self.validate_node(payload))
        return self.repository.save_pipeline(image_id, nodes, pipeline["version"] + 1, int(time.time()))

    def patch(self, image_id: str, node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        pipeline = self.get(image_id)
        nodes = list(pipeline["nodes"])
        node = next((item for item in nodes if item["id"] == node_id), None)
        if node is None:
            raise KeyError("Pipeline node was not found.")
        candidate = {**node, **payload, "id": node_id}
        updated = self.validate_node(candidate)
        updated["created_at"] = node.get("created_at")
        nodes[nodes.index(node)] = updated
        return self.repository.save_pipeline(image_id, nodes, pipeline["version"] + 1, int(time.time()))

    def delete(self, image_id: str, node_id: str) -> dict[str, Any]:
        pipeline = self.get(image_id)
        nodes = [node for node in pipeline["nodes"] if node["id"] != node_id]
        if len(nodes) == len(pipeline["nodes"]):
            raise KeyError("Pipeline node was not found.")
        return self.repository.save_pipeline(image_id, nodes, pipeline["version"] + 1, int(time.time()))

    def toggle(self, image_id: str, node_id: str) -> dict[str, Any]:
        pipeline = self.get(image_id)
        nodes = list(pipeline["nodes"])
        node = next((item for item in nodes if item["id"] == node_id), None)
        if node is None:
            raise KeyError("Pipeline node was not found.")
        node = {**node, "enabled": not node["enabled"]}
        nodes[nodes.index(next(item for item in nodes if item["id"] == node_id))] = node
        return self.repository.save_pipeline(image_id, self.validate_nodes(nodes), pipeline["version"] + 1, int(time.time()))

    def reorder(self, image_id: str, node_id: str, order: int) -> dict[str, Any]:
        pipeline = self.get(image_id)
        nodes = list(pipeline["nodes"])
        node = next((item for item in nodes if item["id"] == node_id), None)
        if node is None:
            raise KeyError("Pipeline node was not found.")
        if isinstance(order, bool) or not isinstance(order, int) or not 0 <= order < len(nodes):
            raise PipelineParamError("order is out of range.")
        nodes.remove(node)
        nodes.insert(order, node)
        return self.repository.save_pipeline(image_id, self.validate_nodes(nodes), pipeline["version"] + 1, int(time.time()))

    @classmethod
    def validate_nodes(cls, nodes: Any) -> list[dict[str, Any]]:
        if not isinstance(nodes, list) or len(nodes) > MAX_NODES:
            raise PipelineParamError(f"nodes must be a list with at most {MAX_NODES} items.")
        validated = [cls.validate_node(node) for node in nodes]
        ids = [node["id"] for node in validated]
        if len(ids) != len(set(ids)):
            raise PipelineParamError("Pipeline node IDs must be unique.")
        return validated

    @classmethod
    def validate_node(cls, node: Any) -> dict[str, Any]:
        if not isinstance(node, dict):
            raise PipelineParamError("Each pipeline node must be an object.")
        node_id = node.get("id") or f"node_{uuid.uuid4().hex[:10]}"
        operation = node.get("operation")
        parameters = node.get("parameters", {})
        enabled = node.get("enabled", True)
        if not isinstance(node_id, str) or not NODE_ID.match(node_id):
            raise PipelineParamError("Node id is invalid.")
        if operation not in SUPPORTED_OPERATIONS:
            raise PipelineParamError("Pipeline operation is not supported.")
        if not isinstance(parameters, dict) or len(parameters) > 20:
            raise PipelineParamError("Node parameters must be an object with at most 20 fields.")
        if not isinstance(enabled, bool):
            raise PipelineParamError("Node enabled must be boolean.")
        return {"id": node_id, "operation": operation, "parameters": parameters, "enabled": enabled}
