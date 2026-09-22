"""Registry of every API error code the backend can emit.

Routes used to pass bespoke string literals to ``error_response`` (60 distinct
codes, with 28 near-identical ``*_FAILED`` variants). Keeping them here gives
one place to audit the contract, and lets an IDE catch a typo at edit time
instead of surfacing it as an unknown code in production.

Codes are grouped by the part of the app that raises them. The ``message``
strings are deliberately generic where a route already supplies a specific
explanation; they exist so a caller can always produce a sane fallback.
"""

from __future__ import annotations

from enum import Enum


class ErrorCodes(Enum):
    """Stable string codes returned under ``error.code`` in API responses."""

    # --- Generic request shaping -------------------------------------------
    INVALID_REQUEST = "INVALID_REQUEST"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED"
    INVALID_EMAIL = "INVALID_EMAIL"
    WEAK_PASSWORD = "WEAK_PASSWORD"
    AUTH_SESSION_INVALID = "AUTH_SESSION_INVALID"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    INVALID_IMAGE_ID = "INVALID_IMAGE_ID"
    INVALID_DIMENSIONS = "INVALID_DIMENSIONS"
    INVALID_ASPECT_RATIO = "INVALID_ASPECT_RATIO"
    RESOURCE_LIMIT = "RESOURCE_LIMIT"

    # --- Image lifecycle ---------------------------------------------------
    IMAGE_SESSION_NOT_FOUND = "IMAGE_SESSION_NOT_FOUND"
    IMAGE_NOT_AVAILABLE = "IMAGE_NOT_AVAILABLE"
    STALE_IMAGE_REVISION = "STALE_IMAGE_REVISION"
    INVALID_FILE = "INVALID_FILE"
    INVALID_FORMAT = "INVALID_FORMAT"
    INVALID_QUALITY = "INVALID_QUALITY"
    UPLOAD_FAILED = "UPLOAD_FAILED"
    NOTHING_TO_UNDO = "NOTHING_TO_UNDO"
    NOTHING_TO_REDO = "NOTHING_TO_REDO"
    CONVERSION_FAILED = "CONVERSION_FAILED"
    EXPORT_FAILED = "EXPORT_FAILED"

    # --- Transform operations ---------------------------------------------
    CROP_FAILED = "CROP_FAILED"
    RESIZE_FAILED = "RESIZE_FAILED"
    ROTATE_FAILED = "ROTATE_FAILED"
    FLIP_FAILED = "FLIP_FAILED"
    INVALID_SMART_CROP = "INVALID_SMART_CROP"
    SMART_CROP_FAILED = "SMART_CROP_FAILED"

    # --- Pixel processing --------------------------------------------------
    PROCESSING_FAILED = "PROCESSING_FAILED"
    GRAYSCALE_FAILED = "GRAYSCALE_FAILED"
    NEGATIVE_FAILED = "NEGATIVE_FAILED"
    BRIGHTNESS_FAILED = "BRIGHTNESS_FAILED"
    CONTRAST_FAILED = "CONTRAST_FAILED"
    SATURATION_FAILED = "SATURATION_FAILED"
    BLUR_FAILED = "BLUR_FAILED"
    SHARPEN_FAILED = "SHARPEN_FAILED"
    GAMMA_FAILED = "GAMMA_FAILED"
    THRESHOLD_FAILED = "THRESHOLD_FAILED"
    SOBEL_FAILED = "SOBEL_FAILED"
    LAPLACIAN_FAILED = "LAPLACIAN_FAILED"
    MEDIAN_FILTER_FAILED = "MEDIAN_FILTER_FAILED"
    MORPHOLOGY_FAILED = "MORPHOLOGY_FAILED"
    HISTOGRAM_FAILED = "HISTOGRAM_FAILED"
    ADJUSTMENTS_FAILED = "ADJUSTMENTS_FAILED"
    NO_ADJUSTMENTS = "NO_ADJUSTMENTS"
    INVALID_OPERATION = "INVALID_OPERATION"

    # --- Layers ------------------------------------------------------------
    INVALID_LAYERS = "INVALID_LAYERS"
    INVALID_LAYER_ASSET = "INVALID_LAYER_ASSET"
    ASSET_NOT_FOUND = "ASSET_NOT_FOUND"
    COMPOSITE_FAILED = "COMPOSITE_FAILED"

    # --- History -----------------------------------------------------------
    HISTORY_IMAGE_NOT_FOUND = "HISTORY_IMAGE_NOT_FOUND"
    HISTORY_INDEX_INVALID = "HISTORY_INDEX_INVALID"
    HISTORY_COMPARISON_INVALID = "HISTORY_COMPARISON_INVALID"
    HISTORY_DIFF_INVALID = "HISTORY_DIFF_INVALID"

    # --- Pipeline ----------------------------------------------------------
    INVALID_PIPELINE = "INVALID_PIPELINE"
    PIPELINE_NODE_NOT_FOUND = "PIPELINE_NODE_NOT_FOUND"
    PIPELINE_EXECUTION_FAILED = "PIPELINE_EXECUTION_FAILED"
    PREVIEW_FAILED = "PREVIEW_FAILED"

    # --- Background studio -------------------------------------------------
    INVALID_MASK_PARAMS = "INVALID_MASK_PARAMS"
    MASK_PREVIEW_FAILED = "MASK_PREVIEW_FAILED"
    INVALID_BACKGROUND_TARGET = "INVALID_BACKGROUND_TARGET"
    BACKGROUND_NOT_FOUND = "BACKGROUND_NOT_FOUND"
    INVALID_BACKGROUND_CATEGORY = "INVALID_BACKGROUND_CATEGORY"
    REMOVE_FAILED = "REMOVE_FAILED"
    REPLACE_FAILED = "REPLACE_FAILED"
    REPLACE_PREVIEW_FAILED = "REPLACE_PREVIEW_FAILED"

    # --- Analysis & suggestions -------------------------------------------
    SUGGESTION_NOT_AVAILABLE = "SUGGESTION_NOT_AVAILABLE"
    APPLY_FAILED = "APPLY_FAILED"

    def __str__(self) -> str:
        return self.value
