"""Accessors for the services wired up in the application factory.

Route modules resolve their collaborators through these helpers instead of
reaching into ``current_app.config`` directly. Centralizing the lookups keeps
the wiring names in one place and gives tests a single seam to swap a service.

The storage accessor deliberately keeps the module-name identity check: tests
monkeypatch the ``FileStorageService`` name on a route module, and the check
detects that swap and returns the replacement instead of the configured
instance.
"""

from __future__ import annotations

from flask import current_app

from .services.file_service import FileStorageService
from .services.image_session_service import ImageSessionService
from .services.layer_compositor_service import LayerCompositorService

# Captured at import time so tests can swap the module-level name via
# monkeypatch; the identity check in get_storage_service detects the swap.
_DEFAULT_FILE_STORAGE_SERVICE = FileStorageService


def get_storage_service(module=None) -> FileStorageService:
    """Return the configured file-storage service.

    ``module`` is the route module performing the lookup. Tests monkeypatch its
    ``FileStorageService`` name to substitute an isolated storage root; the
    identity check against the pristine reference detects that swap. Passing
    ``None`` skips the check and returns the configured instance.
    """
    if (
        module is not None
        and module.FileStorageService is not _DEFAULT_FILE_STORAGE_SERVICE
    ):
        return module.FileStorageService(**{})
    return current_app.config["FILE_STORAGE_SERVICE"]


def get_session_service() -> ImageSessionService:
    return current_app.config["IMAGE_SESSION_SERVICE"]


def get_session_repository():
    return current_app.config["IMAGE_SESSIONS"]


def get_layer_compositor() -> LayerCompositorService:
    return current_app.config["LAYER_COMPOSITOR_SERVICE"]
