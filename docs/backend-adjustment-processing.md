# Backend Adjustment Processing — IntelliCanvas

This stage moves every adjustment control from a browser-only preview into Python. The Flask process endpoints `POST /api/process/{brightness,contrast,saturation,blur,sharpen}` accept a `value` parameter (0–200 percent for the enhancers, 0–20 pixels for blur, 0–5 steps for sharpen), resolve the current image session, apply the operation with Pillow (`ImageEnhance` / `GaussianBlur`), write a new PNG under `backend/storage/processed`, and update the session. `POST /api/process/negative` inverts RGB colors and needs no value.

The editor keeps the instant local canvas preview while a slider is dragged, and commits the operation through an explicit **Apply … in Python** button. On success the canvas reloads the processed result from the backend, and the negative button also clears the local preview checkbox so the baked result is displayed as-is.

## Filename stability

Earlier operations chained the previous processed filename into the next output name, adding a 32-character suffix each time. Five chained operations exceeded the Windows 260-character path limit and made conversion, export, and further processing fail with `IMAGE_NOT_AVAILABLE`. Processed outputs now derive from the session's original upload stem (`base_stem`, capped at 60 characters) with the operation tag and one uuid, so filenames stay bounded regardless of how many operations run. The same rule applies to transform, conversion, and export outputs.

## Verification

Open the editor from `http://localhost:5000/editor-v2/`, upload an image, and press the **Apply … in Python** buttons. Confirm each status message ("Brightness … processed by Python"), and verify a processed file appears in `backend/storage/processed` with a short, operation-tagged filename. Repeating grayscale several times must keep succeeding; `POST /api/images/convert` must still work after any chain of operations.
