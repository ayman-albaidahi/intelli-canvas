# Phase 1 — Editor Stability — IntelliCanvas

This stage hardens the editor's day-to-day behaviour and closes the remaining phase-2 adjustment items, following the agreed priority order.

## Friendly failure states
- Any network failure against the API now raises "Could not reach the Python server. Start Flask with: python backend/run.py" instead of a bare "Failed to fetch".
- `IMAGE_SESSION_NOT_FOUND` reads "Your editing session expired — upload the image again." (in-memory sessions die with the Flask process), and a failed result load reports "Could not load the image from the Python server — is Flask still running?".

## Tools that are not ready are visibly disabled
Filters, Backdrop, History, Pipeline, Analysis, the Keys panel, New and Export carry `is-disabled` styling with `aria-disabled` and a tooltip; clicking explains "… arrives in a later stage". The **Adjust** tool button now opens the Properties tab, expands the Adjustments section, scrolls to it and flashes it (honouring `prefers-reduced-motion`). The Compare button no longer double-toasts.

## Inspector accordion
The Properties panel is split into native `<details>` sections — Adjustments (open), Drawing controls, Quick actions — so the inspector stays compact and the canvas untouched. Collapsing or expanding sections never breaks the adjustment bindings.

## Upload improvements
Dragging an image anywhere onto the canvas zone highlights the area ("Drop your image to start") and uploads on drop; file-picker and drop share one upload routine. The Apply adjustments button stays disabled until an image is uploaded and during any in-flight request.

## Verification
Live checks against `http://localhost:5000/editor-v2/`: ten disabled controls reported, disabled click toast, Apply disabled before upload / enabled after drop, accordion collapse + expand, adjust-focus flash, drag-drop upload succeeded, one batch apply over the wire, and the dead-port fetch rejection confirms the offline mapping.
