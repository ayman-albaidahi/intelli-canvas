# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-15  
**Reference branch:** `main`
**Reference commit:** `d25e2e6a98636d84a23ce0cfa7c19b8f6e0994fb`

## Purpose

This document records the current implementation state. It is a current-state companion to the historical and architectural documents in `docs/`. When an older document describes a planned capability rather than an implemented capability, this document takes precedence for runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 245 passed after Smart Crop implementation |
| Ruff | Passed |
| JavaScript syntax checks | Passed for editor modules |
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

The supported editor URL is `http://localhost:5000/editor-v2/`. The root URL `/` serves the same Editor V2 application. The directory `frontend/editor-v2/` is the active frontend implementation.

## Implemented capability groups

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments and filters, Background Studio operations, history navigation, deterministic image analysis, explainable suggestions, persistent layers, backend layer composition during export, persistent processing pipelines, Image Quality Analyzer, Smart Suggestions, and Smart Crop. Smart Crop is currently exposed as dedicated Transform endpoints and is not yet accepted as a persistent Pipeline node.

The v0.5 Layers & Compositing scope includes validated image, shape, text, and brush layer payloads; persisted z-order; visibility; opacity; transforms; supported blend modes; session-scoped image assets; multi-image composition; and export with `composite_layers=true`.

The v0.6 Background Studio scope extends the color-mask workflow with non-destructive replacement previews, background blur, background scale and X/Y offsets, optional foreground shadow, stronger parameter validation, corrected single-entry History behavior, categorized background metadata, generated thumbnails, a catalog endpoint, and reset/cancel controls. Preview endpoints do not change the current image or History.

The v0.7 History scope adds structured operation parameters, read-only History content URLs, Before/After comparison metadata, and PNG difference maps in absolute, heatmap, and threshold modes. The History panel exposes comparison selectors and displays Before/After images or a diff map. These comparison operations do not change the current image or append History entries. v0.7.1 adds persistent per-image processing pipelines with validated nodes, parameter updates, enable/disable state, ordering, deletion, and a dedicated Pipeline panel. v0.7.2 adds fixed-source Pipeline preview and apply, deterministic cache hashes, one History entry per apply, and cache-aware execution for repeated runs. v0.7.3 adds timeout-aware network handling, retryable Pipeline failure states, operation-specific validation, keyboard accessibility, live status announcements, and repeatable cache-performance coverage.

The v0.8.0 Image Quality Analyzer provides brightness, contrast, sharpness, noise, clipping, findings, quality score, and versioned analysis cache. v0.8.1 adds a multi-rule Smart Suggestions engine with confidence, evidence, combined Pipelines, multi-suggestion UI, read-only Preview, one-entry Apply, Dismiss, and suggestion provenance metadata. v0.8.2 adds Explain Operation, finding and parameter explanations, suggestion source provenance, and evidence display in Image Intelligence. v0.8.3 adds deterministic saliency-based Smart Crop with supported aspect ratios, non-persistent crop preview, Python-backed apply, History parameters, boundary validation, and bounded large-image analysis.

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
| POST | `/api/images/export` | Supports `composite_layers=true` to export the composed image without mutating history. |
| POST | `/api/background/mask-preview` | Returns a non-persistent grayscale foreground mask. |
| POST | `/api/background/replace-preview` | Returns a non-persistent replacement preview with optional effects. |
| POST | `/api/background/remove` | Applies color-mask removal and records one History operation. |
| POST | `/api/background/replace` | Applies color-mask replacement and records one History operation. |
| GET/POST | `/api/history/*` | Supports navigation, content retrieval, comparison, and difference maps. |
| GET/PUT | `/api/pipeline` | Reads or replaces a persistent per-image pipeline. |
| POST/PATCH/DELETE | `/api/pipeline/nodes*` | Adds, updates, deletes, toggles, and reorders validated pipeline nodes. |
| POST | `/api/pipeline/preview` | Executes the pipeline from History index 0 and returns a non-persistent PNG preview. |
| POST | `/api/pipeline/apply` | Executes from the fixed source, reuses cache when possible, and records one History entry. |
| POST | `/api/analysis` | Returns the unified image-quality report with cache metadata. |
| POST | `/api/analysis/export-report` | Exports the quality report as JSON. |
| POST | `/api/explain-operation` | Explains an operation, parameters, optional finding, and optional suggestion source. |
| POST | `/api/transform/smart-crop/preview` | Returns a non-persistent PNG crop proposal with saliency metadata in response headers. |
| POST | `/api/transform/smart-crop/apply` | Applies the saliency-based crop in Python and records one History operation. |

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes multiple-selection and grouping enhancements, per-layer filters, histogram stretching/equalization, general-purpose AI segmentation, and future intelligent assistance. Advanced layer features such as clipping masks, adjustment layers, and per-layer pixel operations are deferred until the layer model and pipeline model evolve together.

Smart Crop is implemented in v0.8.3. Explain Operation is implemented in v0.8.2. Smart Crop Pipeline-node integration, Browser-level E2E coverage, capability discovery, ownership/authentication, and final production hardening remain v0.9 or later work.

The legacy frontend files outside `frontend/editor-v2/` were removed after repository-wide reference checks found no operational dependency on them. Historical documents may still mention former paths because they preserve development history; those references are not runtime entry points.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes.
