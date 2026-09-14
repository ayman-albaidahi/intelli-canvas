# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-14  
**Reference branch:** `main`  
**Reference commit:** `2efb062acc6585d869aad9adf324380743229c96`

## Purpose

This document records the state of the implementation at the review date. It is a **current-state companion** to the historical and architectural documents in `docs/`. It does not replace or rewrite the original architecture baseline. The original documents remain the source of architectural intent, planned capabilities, and historical decisions.

When a statement in an older document describes a planned capability rather than an implemented capability, this document takes precedence for the current runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 203 passed |
| Ruff | Passed |
| JavaScript syntax checks | Passed for changed editor modules |
| Vitest | 3 passed |
| OpenCV/NumPy import | Passed (`cv2` 5.0.0, NumPy 2.5.3) |
| Dependency audit | No known vulnerabilities reported at the prior review |
| Health endpoint | HTTP 200 at the prior review |
| Analysis and suggestion API smoke test | Passed at the prior review |

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

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments and filters, background operations, history navigation, deterministic image analysis, explainable suggestions, and backend layer composition during export.

The analysis feature currently measures image dimensions, grayscale brightness mean, and grayscale contrast standard deviation. It can report low brightness, high brightness, and low contrast findings. The suggestion feature can produce explainable brightness and contrast suggestions, preview a suggested operation, apply a suggestion, and dismiss a suggestion request.

Processing and transformation use Flask, Pillow, OpenCV, and NumPy at runtime. SQLite is used for persistent image-session metadata, editing history, projects, layers, and image-layer asset metadata; image binaries remain in file storage, including the `layer-assets` category. OpenCV and NumPy are isolated to `backend/app/services/process_operations.py`; routes and orchestration services remain stack-agnostic.

The Filters & analysis panel in Editor V2 provides controls for every v0.4 operation. Histogram computation is read-only and leaves the session image and history unchanged. Sobel, Laplacian, median filtering, morphology, gamma correction, and thresholding bake an image result through the existing processing/history flow. The pre-existing Pillow `apply_blur` remains the application's Gaussian blur implementation; no duplicate OpenCV Gaussian blur was introduced.

## Current API additions

The following endpoints belong to the current analysis and suggestion implementation:

| Method | Path | Current behavior |
|---|---|---|
| POST | `/api/analysis` | Returns image metrics and findings. |
| POST | `/api/analysis/export-report` | Downloads the analysis result as `analysis.json`. |
| POST | `/api/suggestions` | Returns findings and explainable suggestions. |
| POST | `/api/suggestions/preview` | Returns a PNG preview without changing image history. |
| POST | `/api/suggestions/apply` | Applies a suggestion and records the operation. |
| POST | `/api/suggestions/dismiss` | Accepts dismissal of a suggestion. |

The current processing API additionally includes:

| Method | Path | Current behavior |
|---|---|---|
| POST | `/api/process/histogram` | Returns 256-bin RGB or grayscale channel histograms without changing the session image or history. |
| POST | `/api/process/sobel` | Applies Sobel edge detection with an optional odd `ksize` from 1 through 7. |
| POST | `/api/process/laplacian` | Applies Laplacian edge detection. |
| POST | `/api/process/median-filter` | Applies a median filter with an optional odd `ksize` from 1 through 15. |
| POST | `/api/process/morphology` | Applies `erode`, `dilate`, `open`, or `close` with an optional odd `ksize` from 1 through 15. |
| POST | `/api/process/gamma` | Applies gamma correction for a value from 0.1 through 5.0. |
| POST | `/api/process/threshold` | Applies binary thresholding for an integer value from 0 through 255. |

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes multiple-image compositing and future intelligent assistance. Those documents remain valid as planning references, but each capability must be verified against the current API and tests before being described as implemented.

The legacy frontend files outside `frontend/editor-v2/` were removed in the dedicated `refactor/remove-legacy-frontend` change after repository-wide reference checks found no operational dependency on them. Historical documents may still mention the former paths because they preserve the project's development history; those references are not runtime entry points.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes, not merely because an implementation phase advances.
