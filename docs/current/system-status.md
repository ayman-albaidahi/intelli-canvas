# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-14  
**Reference branch:** `main`  
**Reference commit:** `3f799aacb2f178fcaa74b59bcef5ba8c6f9e4e9f`

## Purpose

This document records the state of the implementation at the review date. It is a **current-state companion** to the historical and architectural documents in `docs/`. It does not replace or rewrite the original architecture baseline. The original documents remain the source of architectural intent, planned capabilities, and historical decisions.

When a statement in an older document describes a planned capability rather than an implemented capability, this document takes precedence for the current runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 227 passed in the v0.8.1 validation run |
| Ruff | Required to pass |
| JavaScript syntax checks | Required to pass for changed editor modules |
| Vitest | Existing frontend suite remains required |
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

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments and filters, Background Studio operations, history navigation, deterministic image analysis, explainable suggestions, persistent layers, and backend layer composition during export.

The v0.5 Layers & Compositing scope includes validated image, shape, text, and brush layer payloads; persisted z-order; visibility; opacity; transforms; supported blend modes; session-scoped image assets; multi-image composition; and export with `composite_layers=true`.

The v0.6 Background Studio scope extends the existing color-mask workflow with non-destructive replacement previews, background blur, background scale and X/Y offsets, optional foreground shadow, stronger parameter validation, and corrected single-entry History behavior. v0.6.2 adds categorized background metadata, generated thumbnails, a catalog endpoint, and Background Studio reset/cancel controls. Preview endpoints do not change the current image or History. Applied removal and replacement operations preserve the existing PNG/RGBA behavior.

The v0.7.0 History scope adds structured operation parameters, read-only History content URLs, Before/After comparison metadata, and PNG difference maps in absolute, heatmap, and threshold modes. The History panel now exposes comparison selectors and displays Before/After images or a diff map. These comparison operations do not change the current image or append History entries. v0.7.1 adds persistent per-image processing pipelines with validated nodes, parameter updates, enable/disable state, ordering, deletion, and a dedicated Pipeline panel. v0.7.2 adds fixed-source Pipeline preview and apply, deterministic cache hashes, one History entry per apply, and cache-aware execution for repeated runs. v0.7.3 adds timeout-aware network handling, retryable Pipeline failure states, operation-specific validation, keyboard accessibility, live status announcements, and repeatable cache-performance coverage. v0.8.0 adds a unified deterministic Image Quality Analyzer for brightness, contrast, sharpness, noise, clipping, findings, quality score, and versioned analysis cache. v0.8.1 adds a multi-rule Smart Suggestions engine with confidence, evidence, combined Pipelines, multi-suggestion UI, read-only Preview, one-entry Apply, Dismiss, and suggestion provenance metadata.

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
| POST | `/api/background/mask-preview` | Returns a non-persistent grayscale foreground mask. |
| POST | `/api/background/replace-preview` | Returns a non-persistent replacement preview with optional blur, scale, offsets, and shadow. |
| POST | `/api/background/remove` | Applies color-mask removal and records one History operation. |
| POST | `/api/background/replace` | Applies color-mask replacement with optional background effects and records one History operation. |
| GET | `/api/background/backgrounds` | Lists available background library assets. |
| GET | `/api/background/backgrounds/catalog` | Lists category, dimensions, and generated thumbnail metadata for background assets. |
| GET | `/api/background/backgrounds/<name>/thumbnail` | Returns a generated 320×200 JPEG thumbnail. |
| POST | `/api/background/backgrounds` | Validates and uploads a categorized background library asset. |
| GET | `/api/history/content/<image_id>/<index>` | Returns a specific stored History image. |
| GET | `/api/history/compare?image_id=<id>&from=<index>&to=<index>` | Returns read-only Before/After metadata and URLs. |
| POST | `/api/history/diff` | Returns a read-only PNG difference map. |
| GET/PUT | `/api/pipeline` | Reads or replaces a persistent per-image pipeline. |
| POST/PATCH/DELETE | `/api/pipeline/nodes` | Adds, updates, or deletes validated pipeline nodes. |
| POST | `/api/pipeline/nodes/<node_id>/toggle` | Enables or disables a node. |
| POST | `/api/pipeline/reorder` | Reorders a node by zero-based index. |
| POST | `/api/pipeline/preview` | Executes the pipeline from History index 0 and returns a non-persistent PNG preview. |
| POST | `/api/pipeline/apply` | Executes from the fixed source, reuses the cache when possible, and records one `Apply pipeline` History entry. |
| POST | `/api/analysis` | Returns the unified v0.8.0 quality report with cache metadata. |
| POST | `/api/analysis/export-report` | Exports the same unified quality report as JSON. |

The v0.7.3 client uses a 15-second general API timeout and a 30-second Pipeline preview timeout. Failed Pipeline refreshes and mutations expose a retry action. See `docs/v0.7.3-quality.md` for the complete accessibility, failure-state, and performance guidance.

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes the processing pipeline, multiple-selection and grouping enhancements, per-layer filters, histogram stretching/equalization, general-purpose AI segmentation, and future intelligent assistance. The current v0.6 implementation deliberately does not add these capabilities.

Explain Operation is v0.8.2 and Smart Crop is v0.8.3. Advanced layer features such as clipping masks, adjustment layers, and per-layer pixel operations are deferred until the layer model and pipeline model evolve together.

The legacy frontend files outside `frontend/editor-v2/` were removed in the dedicated `refactor/remove-legacy-frontend` change after repository-wide reference checks found no operational dependency on them. Historical documents may still mention the former paths because they preserve the project's development history; those references are not runtime entry points.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes, not merely because an implementation phase advances.
