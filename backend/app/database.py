from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_sessions (
    image_id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(project_id),
    original_filename TEXT NOT NULL,
    base_stem TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    current_filename TEXT NOT NULL,
    current_storage TEXT NOT NULL,
    format TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    history_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL REFERENCES image_sessions(image_id) ON DELETE CASCADE,
    history_index INTEGER NOT NULL,
    operation TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(image_id, history_index)
);
CREATE TABLE IF NOT EXISTS image_layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL REFERENCES image_sessions(image_id) ON DELETE CASCADE,
    layer_id TEXT NOT NULL,
    z_index INTEGER NOT NULL,
    layer_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(image_id, layer_id)
);
CREATE TABLE IF NOT EXISTS image_assets (
    asset_id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL REFERENCES image_sessions(image_id) ON DELETE CASCADE,
    storage_category TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_pipelines (
    pipeline_id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL UNIQUE REFERENCES image_sessions(image_id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_nodes (
    node_id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES image_pipelines(pipeline_id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(pipeline_id, order_index)
);
CREATE INDEX IF NOT EXISTS idx_image_history_image_id ON image_history(image_id, history_index);
CREATE INDEX IF NOT EXISTS idx_image_layers_image_id ON image_layers(image_id, z_index);
CREATE INDEX IF NOT EXISTS idx_image_assets_image_id ON image_assets(image_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_nodes_pipeline_id ON pipeline_nodes(pipeline_id, order_index);
"""


class SQLiteSessionRepository:
    def __init__(self, database_path: str | Path):
        self.database_path = str(database_path)
        self._memory_connection = (
            sqlite3.connect(":memory:") if self.database_path == ":memory:" else None
        )
        if self.database_path != ":memory:":
            Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = self._memory_connection or sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(SCHEMA)
            columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(image_sessions)")
            }
            if "project_id" not in columns:
                connection.execute(
                    "ALTER TABLE image_sessions ADD COLUMN project_id TEXT REFERENCES projects(project_id)"
                )
            history_columns = {
                row[1] for row in connection.execute("PRAGMA table_info(image_history)")
            }
            if "parameters_json" not in history_columns:
                connection.execute(
                    "ALTER TABLE image_history ADD COLUMN parameters_json TEXT NOT NULL DEFAULT '{}'"
                )

    def __contains__(self, image_id: str) -> bool:
        return self.get_session(image_id) is not None

    def get(self, image_id: str) -> dict[str, Any] | None:
        return self.get_session(image_id)

    def list_ids(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT image_id FROM image_sessions ORDER BY created_at"
            ).fetchall()
        return [row[0] for row in rows]

    def delete(self, image_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM image_sessions WHERE image_id = ?", (image_id,)
            )

    def set(self, image_id: str, data: dict[str, Any]) -> None:
        if self.get_session(image_id) is None:
            raise KeyError(image_id)
        self.update_current_image(
            image_id,
            data.get("current_filename") or data.get("stored_filename", ""),
            data.get("current_storage", "uploads"),
            None,
            int(data.get("updated_at", 0)),
        )

    def __len__(self) -> int:
        return self.count()

    def create_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            project_id = payload.get("project_id")
            if project_id is None:
                project_id = uuid.uuid4().hex
                connection.execute(
                    "INSERT INTO projects (project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    (
                        project_id,
                        payload["original_filename"],
                        payload["created_at"],
                        payload["updated_at"],
                    ),
                )
            connection.execute(
                """INSERT INTO image_sessions
                (image_id, project_id, original_filename, base_stem, stored_filename,
                 current_filename, current_storage, format, mime_type, size,
                 history_index, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
                (
                    payload["image_id"],
                    project_id,
                    payload["original_filename"],
                    payload["base_stem"],
                    payload["stored_filename"],
                    payload["current_filename"],
                    payload["current_storage"],
                    payload["format"],
                    payload["mime_type"],
                    payload["size"],
                    payload["created_at"],
                    payload["updated_at"],
                ),
            )
            connection.execute(
                """INSERT INTO image_history
                (image_id, history_index, operation, filename, storage, created_at)
                VALUES (?, 0, ?, ?, ?, ?)""",
                (
                    payload["image_id"],
                    "Upload",
                    payload["stored_filename"],
                    "uploads",
                    payload["created_at"],
                ),
            )
        return self.get_session(payload["image_id"]) or payload

    def create_asset(self, asset: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            if (
                connection.execute(
                    "SELECT 1 FROM image_sessions WHERE image_id = ?",
                    (asset["image_id"],),
                ).fetchone()
                is None
            ):
                raise FileNotFoundError("Image session was not found.")
            connection.execute(
                "INSERT INTO image_assets (asset_id, image_id, storage_category, stored_filename, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    asset["asset_id"],
                    asset["image_id"],
                    asset["storage_category"],
                    asset["stored_filename"],
                    asset["mime_type"],
                    asset["size"],
                    asset["created_at"],
                ),
            )
        return self.get_asset(asset["asset_id"])  # type: ignore[return-value]

    def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM image_assets WHERE asset_id = ?", (asset_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_asset_for_image(
        self, asset_id: str, image_id: str
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM image_assets WHERE asset_id = ? AND image_id = ?",
                (asset_id, image_id),
            ).fetchone()
        return dict(row) if row else None

    def get_session(self, image_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM image_sessions WHERE image_id = ?", (image_id,)
            ).fetchone()
            if row is None:
                return None
            session = dict(row)
            session["history"] = self._history(connection, image_id)
            session["layers"] = self._layers(connection, image_id)
            return session

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            ids = [
                row[0]
                for row in connection.execute(
                    "SELECT image_id FROM image_sessions"
                ).fetchall()
            ]
        return [self.get_session(image_id) for image_id in ids]

    def count(self) -> int:
        with self._connect() as connection:
            return int(
                connection.execute("SELECT COUNT(*) FROM image_sessions").fetchone()[0]
            )

    def update_current_image(
        self,
        image_id: str,
        filename: str,
        storage: str,
        operation: str | None,
        now: int,
        parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._connect() as connection:
            session = connection.execute(
                "SELECT history_index FROM image_sessions WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            if session is None:
                raise FileNotFoundError("Image session was not found.")
            connection.execute(
                "UPDATE image_sessions SET current_filename = ?, current_storage = ?, updated_at = ? WHERE image_id = ?",
                (filename, storage, now, image_id),
            )
            if operation:
                next_index = int(session[0]) + 1
                connection.execute(
                    "DELETE FROM image_history WHERE image_id = ? AND history_index > ?",
                    (image_id, int(session[0])),
                )
                connection.execute(
                    "INSERT INTO image_history (image_id, history_index, operation, filename, storage, created_at, parameters_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        image_id,
                        next_index,
                        operation,
                        filename,
                        storage,
                        now,
                        json.dumps(parameters or {}, separators=(",", ":")),
                    ),
                )
                connection.execute(
                    "UPDATE image_sessions SET history_index = ? WHERE image_id = ?",
                    (next_index, image_id),
                )
        return self.get_session(image_id)  # type: ignore[return-value]

    def set_current_history(
        self, image_id: str, index: int, now: int
    ) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT filename, storage FROM image_history WHERE image_id = ? AND history_index = ?",
                (image_id, index),
            ).fetchone()
            if row is None:
                raise ValueError("History index is out of range.")
            connection.execute(
                "UPDATE image_sessions SET current_filename = ?, current_storage = ?, history_index = ?, updated_at = ? WHERE image_id = ?",
                (row["filename"], row["storage"], index, now, image_id),
            )
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        return session

    def clear_history(self, image_id: str, now: int) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT current_filename, current_storage FROM image_sessions WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            if row is None:
                raise FileNotFoundError("Image session was not found.")
            connection.execute(
                "DELETE FROM image_history WHERE image_id = ?", (image_id,)
            )
            connection.execute(
                "INSERT INTO image_history (image_id, history_index, operation, filename, storage, created_at, parameters_json) VALUES (?, 0, 'Current state', ?, ?, ?, '{}')",
                (image_id, row["current_filename"], row["current_storage"], now),
            )
            connection.execute(
                "UPDATE image_sessions SET history_index = 0, updated_at = ? WHERE image_id = ?",
                (now, image_id),
            )
        return self.get_session(image_id)  # type: ignore[return-value]

    def save_layers(
        self, image_id: str, layers: list[dict[str, Any]], now: int
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            if (
                connection.execute(
                    "SELECT 1 FROM image_sessions WHERE image_id = ?", (image_id,)
                ).fetchone()
                is None
            ):
                raise FileNotFoundError("Image session was not found.")
            connection.execute(
                "DELETE FROM image_layers WHERE image_id = ?", (image_id,)
            )
            for index, layer in enumerate(layers):
                connection.execute(
                    "INSERT INTO image_layers (image_id, layer_id, z_index, layer_type, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        image_id,
                        layer["id"],
                        index,
                        layer["type"],
                        json.dumps(layer, separators=(",", ":")),
                        now,
                        now,
                    ),
                )
        return self.get_layers(image_id)

    def get_layers(self, image_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            if (
                connection.execute(
                    "SELECT 1 FROM image_sessions WHERE image_id = ?", (image_id,)
                ).fetchone()
                is None
            ):
                raise FileNotFoundError("Image session was not found.")
            rows = connection.execute(
                "SELECT payload_json FROM image_layers WHERE image_id = ? ORDER BY z_index",
                (image_id,),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_pipeline(self, image_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            pipeline = connection.execute(
                "SELECT * FROM image_pipelines WHERE image_id = ?", (image_id,)
            ).fetchone()
            if pipeline is None:
                return None
            nodes = connection.execute(
                "SELECT node_id, operation, parameters_json, enabled, order_index, created_at, updated_at FROM pipeline_nodes WHERE pipeline_id = ? ORDER BY order_index",
                (pipeline["pipeline_id"],),
            ).fetchall()
        return {
            "pipeline_id": pipeline["pipeline_id"],
            "image_id": pipeline["image_id"],
            "version": pipeline["version"],
            "created_at": pipeline["created_at"],
            "updated_at": pipeline["updated_at"],
            "nodes": [
                {
                    "id": row["node_id"],
                    "operation": row["operation"],
                    "parameters": json.loads(row["parameters_json"] or "{}"),
                    "enabled": bool(row["enabled"]),
                    "order": row["order_index"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
                for row in nodes
            ],
        }

    def save_pipeline(
        self, image_id: str, nodes: list[dict[str, Any]], version: int, now: int
    ) -> dict[str, Any]:
        with self._connect() as connection:
            if (
                connection.execute(
                    "SELECT 1 FROM image_sessions WHERE image_id = ?", (image_id,)
                ).fetchone()
                is None
            ):
                raise FileNotFoundError("Image session was not found.")
            pipeline = connection.execute(
                "SELECT pipeline_id, created_at FROM image_pipelines WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            pipeline_id = pipeline["pipeline_id"] if pipeline else uuid.uuid4().hex
            created_at = pipeline["created_at"] if pipeline else now
            connection.execute(
                "INSERT INTO image_pipelines (pipeline_id, image_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(image_id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at",
                (pipeline_id, image_id, version, created_at, now),
            )
            connection.execute(
                "DELETE FROM pipeline_nodes WHERE pipeline_id = ?", (pipeline_id,)
            )
            for order, node in enumerate(nodes):
                connection.execute(
                    "INSERT INTO pipeline_nodes (node_id, pipeline_id, operation, parameters_json, enabled, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        node["id"],
                        pipeline_id,
                        node["operation"],
                        json.dumps(node.get("parameters", {}), separators=(",", ":")),
                        int(node.get("enabled", True)),
                        order,
                        node.get("created_at", now),
                        now,
                    ),
                )
        return self.get_pipeline(image_id)  # type: ignore[return-value]

    def _history(
        self, connection: sqlite3.Connection, image_id: str
    ) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT history_index, operation, filename, storage, created_at, parameters_json FROM image_history WHERE image_id = ? ORDER BY history_index",
            (image_id,),
        ).fetchall()
        return [
            {
                "index": row["history_index"],
                "operation": row["operation"],
                "filename": row["filename"],
                "time": row["created_at"],
                "storage": row["storage"],
                "parameters": json.loads(row["parameters_json"] or "{}"),
            }
            for row in rows
        ]

    def get_history_entry(self, image_id: str, index: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT history_index, operation, filename, storage, created_at, parameters_json FROM image_history WHERE image_id = ? AND history_index = ?",
                (image_id, index),
            ).fetchone()
        if row is None:
            return None
        entry = dict(row)
        entry["parameters"] = json.loads(entry.pop("parameters_json") or "{}")
        return entry

    def _layers(
        self, connection: sqlite3.Connection, image_id: str
    ) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT payload_json FROM image_layers WHERE image_id = ? ORDER BY z_index",
            (image_id,),
        ).fetchall()
        return [json.loads(row[0]) for row in rows]
