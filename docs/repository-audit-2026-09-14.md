# IntelliCanvas — Repository Study and Audit

**Audit date:** 2026-09-14  
**Repository:** `ayman-albaidahi/intelli-canvas`  
**Reference:** `origin/main` at commit `95854ab9244286383a06781412c031e3ee4b919c` (`docs: add v0.4 processing review`)  
**Author:** Manus AI

## Executive conclusion

IntelliCanvas has moved beyond a frontend mockup and is now a functional full-stack prototype. The active editor is `frontend/editor-v2/`. The Flask backend provides persistent image sessions, file-backed image revisions, SQLite metadata, history, layers, background operations, server-side processing, image analysis, suggestions, and export.

The latest `main` branch also contains the complete v0.4 processing slice described in the current roadmap. Pillow handles the original operations, while OpenCV and NumPy provide histogram analysis, Sobel, Laplacian, median filtering, morphology, gamma correction, and thresholding. The frontend exposes these operations through the Filters & analysis panel.

The project is ready for a **stabilization and contract-hardening phase**, not a broad feature expansion phase. The most important missing integration is capability discovery. The frontend currently displays controls based on its own code rather than a server capability document. The Processing Pipeline endpoint remains an intentional `501 Not Implemented` stub. Several historical documents still describe old behavior and should be marked as historical or corrected.

## Verification results

| Check | Result | Interpretation |
|---|---:|---|
| Python test suite | **203 passed** | Backend behavior is currently regression-tested at API/service level. |
| Ruff | **Passed** | No lint findings in `backend` and `tests`. |
| Python compilation | **Passed** | Backend modules compile successfully. |
| JavaScript syntax | **Passed** | Every module in `frontend/editor-v2/js/` passed `node --check`. |
| Vitest | **3 passed** | Frontend unit coverage exists for crop and aspect-ratio transform logic. |
| Git diff check | **Passed** | No whitespace errors were detected. |
| CI definition | **Present** | GitHub Actions runs Python setup, tests, Ruff, and pip-audit. |
| Open pull requests | **None observed** | `gh pr list --state open` returned no open PRs at audit time. |

The test tools were installed from the repository's declared development requirements before verification. The Vitest dependency was installed from the root `package.json` before the frontend test run.

## Current architecture

```text
HTML / CSS / JavaScript editor
            ↓
       ApiClient boundary
            ↓
        Flask blueprints
            ↓
     focused Python services
            ↓
 Pillow + OpenCV + NumPy operations
            ↓
 SQLite metadata + file-backed image revisions
```

The separation between image binaries and metadata is appropriate for the prototype. SQLite stores sessions, history, projects, layers, and asset metadata. Image files remain in storage. `ProcessService` orchestrates transformations while `process_operations.py` contains the pixel-level operations. OpenCV and NumPy imports are isolated to the operations module, which keeps route code and orchestration relatively stack-agnostic.

## Implemented capability assessment

| Capability area | Current evidence | Status |
|---|---|---|
| Active editor workspace | `frontend/editor-v2/index.html` and modular JavaScript | Implemented |
| Upload and image content retrieval | Image routes, file storage, `ApiClient.upload()` and `contentUrl()` | Implemented |
| Crop, resize, rotate, and flip | Transform routes, canvas manager, history integration | Implemented foundation |
| Local preview versus committed result | Canvas preview state and explicit Apply workflow | Implemented |
| Python brightness, contrast, blur, sharpen, and saturation | `ProcessService` and `/api/process/*` routes | Implemented |
| Batch adjustment submission | `/api/process/adjustments` and `AdjustmentsManager.applyInPython()` | Implemented |
| v0.4 histogram | Read-only `/api/process/histogram` | Implemented |
| v0.4 edge detection | Sobel and Laplacian routes and controls | Implemented |
| v0.4 noise and morphology | Median filter and morphology routes and controls | Implemented |
| v0.4 tonal tools | Gamma and threshold routes and controls | Implemented |
| Layers and composition | Layer persistence, assets, and composition during export | Implemented backend path; browser validation still needed |
| Background studio | Mask preview, removal, replacement, and background library routes | Implemented backend/frontend path; browser validation still needed |
| History | SQLite history and undo/redo/goto routes | Implemented backend path; browser validation still needed |
| Analysis and suggestions | Metrics, findings, preview, apply, and dismiss endpoints | Implemented foundation |
| Live split-screen comparison | Comparison markup and canvas layers exist | Implemented UI foundation; end-to-end synchronization needs browser test |
| Processing Pipeline | `/api/pipeline` returns `501 Not Implemented` | Deferred |
| API capability discovery | No `GET /api/capabilities` route or startup handshake | Missing |
| Authentication and ownership | No evident user ownership boundary for persisted sessions | Missing for hosted multi-user use |

## Material findings

### 1. Runtime status is newer than portions of the documentation

The runtime branch contains v0.4 OpenCV/NumPy processing, but historical documents such as `docs/backend-frontend-integration.md` and `docs/backend-grayscale-processing.md` still contain language stating that process routes return `501`. That statement is no longer correct for the operations now implemented.

This creates a documentation-risk rather than an immediate runtime defect. A new contributor may follow an obsolete document and incorrectly assume that the backend is still a stub.

**Recommendation:** Label those files as historical implementation notes or update their status sections to link to `docs/current/system-status.md` and `docs/current/v0.4-image-processing-review.md`.

### 2. Capability discovery remains the highest-value next integration

`ApiClient` knows how to call many endpoints, but it does not first ask the backend which operations are supported. The Filters manager disables controls only when no image is loaded or while it is busy. It does not distinguish an unsupported operation from a temporarily unavailable one.

**Impact:** A frontend and backend from different branches can display a valid-looking control that fails only after a click. This is the same class of synchronization problem that previously caused confusing 404 behavior.

**Recommendation:** Add `GET /api/capabilities` returning an API version, supported operations, parameter ranges, maximum image constraints, and feature flags. The frontend should fetch this document during startup and disable unsupported controls with an explicit status message.

### 3. The Processing Pipeline is still intentionally deferred

`backend/app/routes/pipeline.py` exposes `GET` and `POST` but always returns the shared not-implemented response. The roadmap expects ordered operations that can be modified, disabled, and reordered.

This should not be implemented as an unstructured collection of route conditionals. The canonical contract should accept an ordered list of operation nodes, validate each node, execute only enabled nodes, and record one reproducible history entry containing the pipeline definition.

**Recommendation:** Implement the pipeline after capability discovery. Preserve the existing operation-specific endpoints as compatibility aliases, but make the pipeline the canonical multi-operation contract.

### 4. Frontend verification is still much smaller than backend verification

The backend has 203 passing tests. Frontend automated coverage currently consists of three Vitest assertions for transform logic. Syntax validation confirms that modules parse, but it does not prove that DOM selectors, canvas state, network responses, loading states, comparison mode, or error recovery work in a browser.

**Recommendation:** Add browser smoke tests for upload, preview, Python Apply, filter application, before/after comparison, layer save/restore, history undo/redo, background removal, analysis, and export. The first smoke test should cover the critical path: upload → adjust locally → Apply in Python → reload committed content → undo.

### 5. Production configuration is improved but still has a development fallback

`config.py` reads `SECRET_KEY` from the environment and includes image-side and pixel-count limits. It still provides a development fallback secret. That fallback is acceptable for local development but should not be usable when the application runs in production mode.

**Recommendation:** Add an explicit production configuration check that fails startup when `SECRET_KEY` is absent or insecure. Continue enforcing file-size, side-length, and pixel-count limits for both primary uploads and layer assets.

### 6. Revision identity should become explicit

Processing updates the current image and history, and the frontend cache-busts the stable content URL. This is adequate for sequential local interactions, but it does not fully protect against out-of-order network responses or stale UI state.

**Recommendation:** Add a monotonically increasing revision identifier to the image session. Every mutating request should accept an optional source revision and return the new revision. The frontend should ignore or surface stale responses instead of silently replacing a newer canvas state.

## Priority plan

| Priority | Next work item | Acceptance criteria |
|---|---|---|
| P0 | Add `/api/capabilities` | Endpoint returns version, operations, ranges, and limits; frontend consumes it on startup; unsupported controls are visibly disabled. |
| P0 | Correct historical documentation | No document claims implemented process routes are still `501`; current status links identify the authoritative runtime state. |
| P0 | Add browser smoke-test foundation | A real browser verifies upload, local preview, Python Apply, committed reload, and one undo/redo cycle. |
| P1 | Implement the Processing Pipeline | Ordered, enabled/disabled operation nodes are validated, executed deterministically, and recorded in history. |
| P1 | Add explicit revision IDs | Mutations return revision metadata and stale requests cannot overwrite newer state. |
| P1 | Test layers and background workflows in-browser | Layer persistence, composition, mask preview, removal, and replacement work through the active editor. |
| P1 | Harden production configuration | Production refuses fallback secrets and all image entry points enforce consistent validation. |
| P2 | Expand frontend unit coverage | API client errors, adjustment state, filters manager, analysis manager, and comparison state have isolated tests. |
| P2 | Add ownership and cleanup policies | Persisted sessions and assets have an owner boundary, retention policy, and quota strategy. |

## Final assessment

The repository is in a healthy prototype state with a credible architecture and successful automated backend verification. The v0.4 image-processing milestone is substantially complete on `main`; it should no longer be treated as a planned-only feature. The next development increment should focus on **contract synchronization, browser-level proof, and the Processing Pipeline**, while keeping the distinction between local preview and committed Python results explicit in the UI.

The most appropriate next PR is therefore: **Capability Discovery + current documentation cleanup + one browser smoke test for the complete adjustment workflow**. This sequence reduces integration risk before adding more editor tools.

## References

[1]: https://github.com/ayman-albaidahi/intelli-canvas "IntelliCanvas GitHub repository"
[2]: https://docs.pytest.org/en/stable/ "pytest documentation"
[3]: https://vitest.dev/ "Vitest documentation"
[4]: https://docs.opencv.org/ "OpenCV documentation"
[5]: https://numpy.org/doc/ "NumPy documentation"
