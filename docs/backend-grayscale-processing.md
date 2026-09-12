# Backend Grayscale Processing — IntelliCanvas

This stage moves the first pixel operation from the browser into Python. The Flask endpoint `POST /api/process/grayscale` resolves the current image session, opens the stored image with Pillow, converts it to grayscale, writes a new PNG in `backend/storage/processed`, updates the session's current image, and returns result metadata.

The editor now exposes an explicit **Apply grayscale in Python** action. It sends the current `image_id` to the API, displays processing status, reloads the resulting content from the backend, and reports success or failure. This is deliberately separate from the existing local preview checkbox so the processing boundary is visible during testing.

## Verification

Open the editor from `http://localhost:5000/editor-v2/`, upload an image, and press **Apply grayscale in Python**. Confirm the status changes to “Grayscale processed by Python”. In DevTools Network, verify `POST /api/process/grayscale` followed by the content request. In the backend terminal, verify Flask logs the processing request. A processed file is stored under `backend/storage/processed` and the session now points to it.

The remaining process routes continue to return `501 NOT IMPLEMENTED` until their corresponding Python services are implemented.
