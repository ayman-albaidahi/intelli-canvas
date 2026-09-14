# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-14  
**Reference branch:** `main`  
**Reference commit:** `ac7c11ce79b31c4d0773313e2ab1a27508ed6614`

## Purpose

This document records the state of the implementation at the review date. It is a **current-state companion** to the historical and architectural documents in `docs/`. It does not replace or rewrite the original architecture baseline. The original documents remain the source of architectural intent, planned capabilities, and historical decisions.

When a statement in an older document describes a planned capability rather than an implemented capability, this document takes precedence for the current runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 206 passed in the v0.5 validation run |
| Ruff | Passed in the v0.5 validation run |
| JavaScript syntax checks | Passed for changed editor modules |
| Vitest | 3 passed |
| OpenCV/NumPy import | Passed (`cv2` 5.0.0, NumPy 2.5.3) |

## Official local entry points

The supported development commands are run from the repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
pytest -q
ruff check backend tests
python backend/run.py
```

The supported editor URL is:

```text
http://localhost:5000/editor-v2/
```

The root URL `/` serves the same Editor V2 application. The directory `frontend/editor-v2/` is the active frontend implementation.

## Implemented capability groups

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments and filters, background operations, history navigation, deterministic image analysis, explainable suggestions, persistent layers, and backend layer composition during export.

The v0.5 Layers & Compositing scope now includes validated image, shape, text, and brush layer payloads; persisted z-order; visibility; opacity; transforms; supported blend modes; session-scoped image assets; multi-image composition; and export with `composite_layers=true`. The active Editor V2 Layers panel provides selection, visibility toggling, locking, renaming, duplication, drag-and-drop ordering, edge ordering, deletion, and transform/opacity/blend controls.

Layer composition is intentionally separate from the v0.4 pixel-processing history: export composition renders the persisted layers without changing the current base image or adding a history entry. Layer image assets are checked against the image session when persisted and retrieved.

Processing and transformation use Flask, Pillow, OpenCV, and NumPy at runtime. SQLite is used for persistent image-session metadata, editing history, projects, layers, and image-layer asset metadata; image binaries remain in file storage, including the `layer-assets` category. OpenCV and NumPy are isolated to `backend/app/services/process_operations.py`; routes and orchestration services remain stack-agnostic.

## Current API additions

| Method | Path | Current behavior |
|---|---|---|
| POST | `/api/process/histogram` | Returns 256-bin RGB or grayscale channel histograms without changing the session image or history. |
| POST | `/api/process/sobel` | Applies Sobel edge detection with an optional odd `ksize` from 1 through 7. |
| POST | `/api/process/laplacian` | Applies Laplacian edge detection. |
| POST | `/api/process/median-filter` | Applies a median filter with an optional odd `ksize` from 1 through 15. |
| POST | `/api/process/morphology` | Applies `erode`, `dilate`, `open`, or `close` with an optional odd `ksize` from 1 through 15. |
| POST | `/api/process/gamma` | Applies gamma correction for a value from 0.1 through 5.0. |
| POST | `/api/process/threshold` | Applies binary thresholding for an integer value from 0 through 255. |
| GET | `/api/layers?image_id=<id>` | Returns persisted layers in z-order. |
| PUT | `/api/layers` | Validates and persists layer payloads and stores image data URLs as session-scoped assets. |
| POST | `/api/layers/compose` | Renders visible persisted layers over the current base image. |
| GET | `/api/layers/assets/<asset_id>?image_id=<id>` | Returns an image layer asset only for its owning image session. |
| POST | `/api/images/export` | Supports `composite_layers=true` to export the composed image without mutating history. |

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes the processing pipeline, multiple-selection and grouping enhancements, per-layer filters, histogram stretching/equalization, and future intelligent assistance. The current v0.5 implementation deliberately does not add these capabilities.

The pipeline endpoint remains a separate v0.7 scope. Smart Crop and suggested processing pipelines remain v0.8 scope. Advanced layer features such as clipping masks, adjustment layers, and per-layer pixel operations are deferred until the layer model and pipeline model evolve together.

The legacy frontend files outside `frontend/editor-v2/` were removed in the dedicated `refactor/remove-legacy-frontend` change after repository-wide reference checks found no operational dependency on them. Historical documents may still mention the former paths because they preserve the project's development history; those references are not runtime entry points.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes, not merely because an implementation phase advances.
