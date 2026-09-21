# IntelliCanvas — Current Implementation Status

**Last reviewed:** 2026-09-21
**Reference branch:** `main`
**Reference commit:** `33c7cb2` (includes PRs #100 frontend manager coverage, #101 image revisions, #102 browser smoke)
**Companion roadmap:** `docs/v0.9.1-development-roadmap.md` (supersedes `docs/v0.9-pr-roadmap.md`, which predates the restructuring)

## Purpose

This document records the current implementation state. It is a current-state companion to the historical and architectural documents in `docs/`. When an older document describes a planned capability rather than an implemented capability, this document takes precedence for runtime status.

## Verification summary

| Check | Result |
|---|---:|
| Automated Python tests | 287 passed |
| Ruff (`ruff check backend tests`) | Passed |
| Ruff format (`ruff format --check`) | 85 files already formatted |
| `compileall` | Passed |
| Architecture boundary tests | 6 passed (`tests/test_architecture.py`) |
| JavaScript syntax checks | Passed for editor modules |
| Vitest | 61 passed (5 suites: transform-logic, api-client, history-manager, adjustments-manager, ui-manager) |
| Browser E2E (Playwright) | 22 passed — core editor workflow and backend-unreachable fallback (`tests/browser/smoke.spec.js`); mobile/tablet/desktop responsive coverage with a closable Inspector drawer and a measured "no interactive control outside the viewport" gate (`tests/browser/mobile.spec.js`); and one flow per shipping tool — Image Intelligence and Smart Suggestions, Smart Crop, Pipeline, Background Studio, filters and histogram, History navigation and comparison, Layers, and Export in all three formats (`tests/browser/features.spec.js`) |
| OpenCV/NumPy import | Passed (`cv2` 5.0.0, NumPy 2.4.6) |
| CI on `main` | `.github/workflows/ci.yml` runs compileall, pytest, `git diff --check`, `ruff check`, `ruff format --check`, `pip-audit --strict` (backend); `npm ci`, `node --check`, `npx vitest run` (frontend); `npx playwright test` with the Playwright `webServer` fixture booting the backend (browser) |

## Backend restructuring (2026-09-19 → 2026-09-20)

A four-phase restructuring landed on `main` (PRs #87–#97). It changed the internal
architecture without altering the public API contract:

- **Cross-cutting layer** — `validation.py` (typed `require_*` validators with per-field
  `code=`), `error_codes.py` (single `ErrorCodes` enum, **61 members**, zero raw error
  strings in routes), `views.py` (allowlist-based response filter), `dependencies.py`
  (one access point for storage/session collaborators).
- **Domain model** — frozen `OperationResult` dataclass. Serialization is an allowlist,
  so the absolute storage `path` is structurally absent from every response rather than
  filtered per-endpoint.
- **Unified operation registry** — `backend/app/operations/registry.py`. Each of the
  **14** image operations is defined exactly once as an `OperationSpec`; both the
  pipeline executor and the REST routes dispatch through it, so a contract cannot drift
  between entry points and adding an operation is additive.
- **Boundary tests** — `tests/test_architecture.py` fails the build if a service couples
  to Flask's request handling, a route imports a repository, the service graph cycles, or
  a registered operation lacks a route.

## Official local entry points

The supported development commands are run from the repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
pytest -q
ruff check backend tests
ruff format --check backend tests
python -m compileall -q backend
python backend/run.py
```

Browser tests boot the server themselves via the Playwright `webServer` fixture, so
no manual `backend/run.py` is needed and CI no longer starts a second instance:

```bash
npx playwright install --with-deps chromium   # one-time browser download
npx playwright test
```

System Chrome is the default browser because the Playwright-hosted headless shell
is blocked by Application Control policy on some locked-down machines
(WinError 4551). Set `PLAYWRIGHT_USE_HOSTED_CHROMIUM=1` to use the managed
browser instead.

The supported editor URL is `http://localhost:5000/editor-v2/`. The root URL `/` serves the same Editor V2 application. The directory `frontend/editor-v2/` is the active frontend implementation.

## Implemented capability groups

The current backend exposes working endpoints for image upload and content retrieval, format conversion and export, crop and resize, rotation and flipping, processing adjustments and filters, Background Studio operations, history navigation, deterministic image analysis, explainable suggestions, persistent layers, backend layer composition during export, persistent processing pipelines, Image Quality Analyzer, Smart Suggestions, and Smart Crop. Smart Crop is available through dedicated Transform endpoints and as a validated `smart-crop` Pipeline node.

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
| POST | `/api/pipeline/preview` | Executes the pipeline from History index 0, including `smart-crop`, and returns a non-persistent PNG preview. |
| POST | `/api/pipeline/apply` | Executes from the fixed source, reuses cache when possible, and records one History entry. |
| POST | `/api/analysis` | Returns the unified image-quality report with cache metadata. |
| POST | `/api/analysis/export-report` | Exports the quality report as JSON. |
| POST | `/api/explain-operation` | Explains an operation, parameters, optional finding, and optional suggestion source. |
| POST | `/api/transform/smart-crop/preview` | Returns a non-persistent PNG crop proposal with saliency metadata in response headers. |
| POST | `/api/transform/smart-crop/apply` | Applies the saliency-based crop in Python and records one History operation. |
| GET | `/api/capabilities` | Reports the API version, every registered operation, and each operation's parameter contract (type, inclusive bounds, default, error code). Derived from the operation registry, so a new operation appears automatically. Read-only; no image session required. |
| POST | `/api/process/*` (all registered operations, `/adjustments`, `/histogram`) | Accept an optional `source_revision`. When supplied, it must match the session's current history index or the request is rejected with 409 `STALE_IMAGE_REVISION` before any work runs and no History entry is appended. Omitting it preserves the historic unconditional behaviour. The guard follows the history pointer, so it stays correct across undo/redo. Transform, pipeline, and background endpoints are not yet covered by the guard. |

## Known non-current or deferred capabilities

The architecture and requirements documents describe a broader roadmap that includes multiple-selection and grouping enhancements, per-layer filters, histogram stretching/equalization, general-purpose AI segmentation, and future intelligent assistance. Advanced layer features such as clipping masks, adjustment layers, and per-layer pixel operations are deferred until the layer model and pipeline model evolve together.

Smart Crop is implemented in v0.8.3, including Pipeline-node integration. Explain Operation is implemented in v0.8.2.

The v0.9 roadmap has been superseded by `docs/v0.9.1-development-roadmap.md`. What the old roadmap called "v0.9 Polish & Testing" is now partially complete — API error contracts are unified, the backend quality gate is in place, API capability discovery is implemented (`GET /api/capabilities`), frontend manager coverage has grown from one suite to five (api-client, history-manager, adjustments-manager, transform-logic, ui-manager), the image revision guard is in place, browser E2E covers the smoke suite plus per-tool feature flows and responsive layout, and the mobile interaction model has landed: below 900px the Inspector is no longer `display:none` with no reopen path, it is a closable drawer opened from the workspace header and closed by scrim tap or Escape, with `aria-expanded`/`aria-controls` wiring and focus returned to the toggle. The desktop three-column identity above 900px is unchanged. Remaining v0.9.1 work: **frontend manager tests for the remaining managers (pipeline-manager and the tool managers).** These gate the product features (Auto Enhance, Presets, Profiles, Quality Gates, Batch). Ownership/authentication and final production hardening remain later work.

## Fixes landed with the 2026-09-21 verification pass

The per-tool browser flows are not only coverage — writing them surfaced two real defects that unit tests had been masking:

- **History panel never refreshed after any operation.** `HistoryManager.refresh()` called `this.render(state.image)`, but `ApiClient.history()` already unwraps the response envelope and returns the history state directly, so `state.image` was `undefined`, `render()` threw, and `refresh()` swallowed the exception in an empty `catch`. The panel therefore showed nothing after upload, adjustments, filters, pipeline apply, background work, or Smart Crop. The same double-unwrap existed in `step()`, `goto()`, and `clear()`. The unit tests did not catch it because their mock clients wrapped the state in `{ image: ... }`, matching the bug rather than the contract; the mocks now return the bare state and two regression tests pin the behaviour.
- **`ic-operation` was dispatched while the acting manager was still busy.** `HistoryManager.refresh()` returns immediately whenever any manager is mid-operation, so the event fired from inside the `try` block — before the `finally` cleared the flag — and was silently dropped. Every manager that applies an operation (pipeline, adjustments, analysis, background, filters, smart-crop) now dispatches after the busy flag clears, so the history list reliably reflects each committed change.

## Change-control rule

Future implementation changes should update this document when they change the supported entry point, current API surface, dependency set, verification totals, or implementation status of a major capability. Historical architecture documents should be changed only when an architectural decision itself changes.
