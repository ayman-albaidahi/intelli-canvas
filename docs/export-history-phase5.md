# Phase 5 — Export Interface & History System — IntelliCanvas

This stage completes the roadmap's delivery layer: a real export dialog and a full operation-history system backed by the session.

## Export interface

The top-bar Export button opens a dialog with: format selection (PNG with transparency, JPEG, WEBP), a quality slider for JPEG/WEBP, resize-before-export width/height with aspect-ratio locking, a file-name field, and a busy state during export. The backend `POST /api/images/export` accepts optional `quality` (1–100), and `width`/`height` (1–20000, missing side computed from the ratio, LANCZOS resampling). JPEG export flattens transparency onto white. The result downloads under the chosen name; invalid values return per-field error codes.

## History system

Every session-changing operation now records a labelled history entry — Upload, Grayscale, Brightness 150%, Resize 400x300, Remove background, … — through the single `update_current_image` choke point, storing filename + timestamp. New endpoints:

- `GET /api/history?image_id=` — ordered entries with the current index
- `POST /api/history/goto` — jump to any step (400 `HISTORY_INDEX_INVALID` out of range)
- `POST /api/history/undo` / `redo` — 400 `NOTHING_TO_UNDO` / `NOTHING_TO_REDO` at the edges
- `POST /api/history/clear` — keep the current state only

A third inspector tab renders the timeline: each entry shows its operation and time, the current step is highlighted, clicking any entry jumps to it and reloads the canvas, and header buttons drive undo/redo/clear. The panel auto-refreshes after every Python operation (`ic-operation` event) and the inspector's History shortcut now opens it.

## Verification

14 new backend tests (142 total) cover history recording order, undo/redo/goto state restoration with pixel checks, edge rejections, clear semantics, resize-by-width export, JPEG quality bytes, white flattening, and per-field validation. Verified live through the real UI: the export dialog round-trip (prefill, ratio sync, JPEG download name), automatic recording of a brightness bake, timeline jump back to Upload (pixel-verified red restored), redo, and clear — confirmed both in the browser and by the server request log.

## Deferred

Processing-pipeline editing (re-order/disable/re-apply), multi-select and grouping, inline text editor, and project management (New/Open/Save) build directly on this history/operation foundation.
