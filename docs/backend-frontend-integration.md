# Backend–Frontend Integration Slice — IntelliCanvas

This stage connects `frontend/editor-v2/` to the existing Flask application instead of creating a parallel backend. The editor can now upload the selected image to `POST /api/images`, keep the returned `image_id`, and display the backend-served content from `GET /api/images/{image_id}/content`.

The Flask application now exposes the editor at `/editor-v2/`, so the preferred development URL is served by the same origin as the API. A small development CORS response is also included for the existing separate static-server workflow on port 5500.

The frontend API boundary lives in `api-client.js`. It currently supports upload, content URL generation, transform requests, and export blob retrieval. The current UI integration covers upload and backend content display with loading, success, and error status feedback. Existing backend transform endpoints remain available for the next integration increment; process filters correctly remain deferred while their routes return `501 NOT IMPLEMENTED`.

## Run

From the repository root:

```bash
python -m pip install -r backend/requirements.txt
python backend/run.py
```

Open:

```text
http://localhost:5000/editor-v2/
```

Choose an image and confirm the file is uploaded, an API session is created, and the displayed content is loaded from the backend endpoint.

## Scope

This stage does not change the backend processing contracts or implement the unfinished filter routes. It establishes the real upload/content connection and keeps frontend preview state separate from the backend source of truth.
