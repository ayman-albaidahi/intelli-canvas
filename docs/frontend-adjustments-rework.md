# Adjustments Rework — IntelliCanvas

This stage replaces the per-adjustment "Apply … in Python" buttons with a single batch workflow: sliders give an instant local preview, and one **Apply adjustments** button sends every value to Python at once.

## Batch endpoint

`POST /api/process/adjustments` accepts optional `brightness`, `contrast`, `saturation` (0–200), `blur` (0–20), `sharpen` (0–5), and `grayscale` / `negative` booleans. The service chains the operations in a single Pillow pass and writes one PNG, so a five-slider edit costs one request and one file instead of five. Requests whose values are all neutral are rejected with `NO_ADJUSTMENTS`, and out-of-range or wrongly typed fields return their per-field error codes.

## Editor experience

- Each slider row shows a live numeric value and a per-slider reset button; **Reset all** restores every control.
- **Live preview** toggle: on, sliders drive the instant canvas estimate; off, the canvas shows the true Python result with no filter.
- **Before/After** opens the split comparison: the left side is the baked Python result, the right side adds the current preview filter.
- The summary pill distinguishes `Neutral`, `Unapplied changes` (a non-neutral payload is ready), and `Processing…`; the applied line reports exactly what Python baked (`Python applied: brightness 130 · blur 5px`) and whether the preview is up to date or differs.
- While a request runs, the Apply button is disabled, turns translucent with a spinner, and reads "Processing in Python…".
- Guards: nothing is sent when every value is neutral, and an identical payload to the previous apply is rejected client-side ("Values unchanged since the last apply"), so repeated clicks never create duplicate results.
- After a successful bake the sliders reset to neutral and the preview clears, so the canvas shows exactly the Python result with no double filter.

## Verification

Run the editor from `http://localhost:5000/editor-v2/`, upload an image, drag Brightness and Blur, and press **Apply adjustments**: the button must show its busy state, exactly one `POST /api/process/adjustments` must appear in the server log, sliders must return to neutral, and the applied line must read "preview is up to date". Setting the same values again and pressing Apply must show the unchanged-values toast without a new request. Toggling Live preview off must remove the local filter, and Before/After must open the split view.
