"""Accessors for the services wired up in the application factory.

Route modules resolve their collaborators through these helpers instead of
reaching into ``current_app.config`` directly. Centralizing the lookups keeps
the wiring names in one place and gives tests a single seam to swap a service:
overwrite the ``app.config`` entry, or patch the accessor, and every route
picks up the replacement.

Services are constructed only in :func:`create_app`; these accessors never
build a fallback instance. A service that could supply its own default storage
root used to be able to silently disagree with the configured one, so those
constructor fallbacks were removed and this accessor became a plain lookup.
"""

from __future__ import annotations

from flask import current_app

from .services.auth_service import AuthService
from .services.background_service import BackgroundService
from .services.file_service import FileStorageService
from .services.geometry_service import GeometryService
from .services.history_comparison_service import HistoryComparisonService
from .services.image_io_service import ImageIOService
from .services.image_session_service import ImageSessionService
from .services.image_upload_service import ImageUploadService
from .services.layer_compositor_service import LayerCompositorService
from .services.pipeline_execution_service import PipelineExecutionService
from .services.pipeline_service import PipelineService
from .services.process_service import ProcessService
from .services.smart_crop_service import SmartCropService


def get_storage_service() -> FileStorageService:
    return current_app.config["FILE_STORAGE_SERVICE"]


def get_session_service() -> ImageSessionService:
    return current_app.config["IMAGE_SESSION_SERVICE"]


def get_session_repository():
    return current_app.config["IMAGE_SESSIONS"]


def get_image_io_service() -> ImageIOService:
    return current_app.config["IMAGE_IO_SERVICE"]


def get_process_service() -> ProcessService:
    return current_app.config["PROCESS_SERVICE"]


def get_geometry_service() -> GeometryService:
    return current_app.config["GEOMETRY_SERVICE"]


def get_background_service() -> BackgroundService:
    return current_app.config["BACKGROUND_SERVICE"]


def get_smart_crop_service() -> SmartCropService:
    return current_app.config["SMART_CROP_SERVICE"]


def get_pipeline_service() -> PipelineService:
    return current_app.config["PIPELINE_SERVICE"]


def get_pipeline_execution_service() -> PipelineExecutionService:
    return current_app.config["PIPELINE_EXECUTION_SERVICE"]


def get_history_comparison_service() -> HistoryComparisonService:
    return current_app.config["HISTORY_COMPARISON_SERVICE"]


def get_image_upload_service() -> ImageUploadService:
    return current_app.config["IMAGE_UPLOAD_SERVICE"]


def get_layer_compositor() -> LayerCompositorService:
    return current_app.config["LAYER_COMPOSITOR_SERVICE"]


def get_auth_service() -> AuthService:
    return current_app.config["AUTH_SERVICE"]
