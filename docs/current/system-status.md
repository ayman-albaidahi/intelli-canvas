# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-14  
**Reference branch:** `main`  
**Reference commit:** `27c644d6afe81444ddf8345ce31629aa606c0f60`

## Purpose

This document records the state of the implementation at the review date. It is a **current-state companion** to the historical and architectural documents in `docs/`. It does not replace or rewrite the original architecture baseline. The original documents remain the source of architectural intent, planned capabilities, and historical decisions.

When a statement in an older document describes a planned capability rather than an implemented capability, this document takes precedence for the current runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 166 passed |
| Ruff | Passed |
| Python compilation | Passed |
| JavaScript syntax checks | Passed |
| Dependency audit | No known vulnerabilities reported |
| Health endpoint | HTTP 200 |
| Analysis and suggestion API smoke test | Passed |

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

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments, background operations, history navigation, deterministic image analysis, and explainable suggestions.

The analysis feature currently measures image dimensions, grayscale brightness mean, and grayscale contrast standard deviation. It can report low brightness, high brightness, and low contrast findings. The suggestion feature can produce explainable brightness and contrast suggestions, preview a suggested operation, apply a suggestion, and dismiss a suggestion request.

The processing and transformation behavior is implemented with the current Flask and Pillow runtime dependencies. OpenCV, NumPy, and SQLite remain part of the documented architectural direction where they are described, but they are not current runtime dependencies in `backend/requirements.txt`.

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

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes histogram processing, edge detection, morphological operations, multiple-image compositing, and future intelligent assistance. Those documents remain valid as planning references, but each capability must be verified against the current API and tests before being described as implemented.

The legacy frontend files outside `frontend/editor-v2/` are retained in the repository but are not the supported product entry point. Any decision to isolate or remove them must be made in a separate refactoring change after checking historical references and user workflows.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes, not merely because an implementation phase advances.
