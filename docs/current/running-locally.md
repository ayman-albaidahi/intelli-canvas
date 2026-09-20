# IntelliCanvas — Running and Testing Locally

**Last updated:** 2026-09-20
**Reference commit:** `18dc879` (all v0.9.1 quality work merged)

This guide gets the editor running on your machine and gives you a concrete
scenario for testing it against real photos. If a document disagrees with
what the code actually does, the code wins — verify with the commands here.

---

## 1. One-time setup

Requires Python 3.10+ and Node 20+.

```bash
# from the repository root
python -m venv .venv
.venv/Scripts/activate          # Windows (Git Bash)
# source .venv/bin/activate     # macOS / Linux

python -m pip install -r backend/requirements-dev.txt
npm install
```

Verify the install succeeded:

```bash
python -c "import flask, cv2, numpy, PIL; print('backend deps OK')"
npx playwright install chromium  # optional; the tests also accept system Chrome
```

---

## 2. Start the project

```bash
python backend/run.py
```

You should see:

```
 * Serving Flask app 'backend.app'
 * Running on http://127.0.0.1:5000
```

Three entry points all serve the same Editor V2 application:

| URL | What it is |
|---|---|
| http://localhost:5000/ | Root — the editor |
| http://localhost:5000/editor-v2/ | Canonical editor URL |
| http://localhost:5000/api/health | JSON health check |

**The editor is the whole product.** Open `http://localhost:5000/` in your
browser and you are looking at the app.

To confirm the backend is healthy without the browser:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/capabilities
```

`/api/capabilities` lists every operation the running backend supports with
its exact parameter bounds. The frontend reads this same endpoint, so a tool
the backend lacks is disabled in the UI rather than 404-ing after a click.

---

## 3. Testing on real photos — a guided scenario

Pick **two or three photos** before you start. Good candidates:

- A landscape with a bright, washed-out sky
- A portrait with poor indoor lighting
- A noisy low-light phone photo

Each exercises different tools. Work through the scenario below; it hits every
major subsystem in roughly the order a real session would.

### Scenario A — rescue an underexposed photo

1. **Upload** — drag the photo onto the canvas, or press **Open** and choose it.
   Wait for the status line to read *Saved in API session*. The name appears
   in the document header.

2. **Check the diagnosis first** — open the **Intelligence** panel and run
   **Analyze**. The quality analyzer reports brightness, contrast, sharpness,
   noise, and clipping, with a score and findings. This tells you what to fix
   instead of guessing.

3. **Adjust non-destructively** — in the **Adjust** panel, drag **Brightness**
   up. The canvas updates locally (a preview, no server round-trip) and the
   status line still says nothing was applied. Nothing is committed yet.

4. **Bake the change** — press **Apply adjustments**. This is the real
   operation: it runs in Python via OpenCV, writes one file, and appends one
   History entry. The status line confirms it landed.

5. **Compare before/after** — the **Before/After** button splits the view.
   This reads History without changing the current image.

6. **Undo and redo** — History panel, or the undo/redo buttons. Each jump
   loads the exact bytes of that entry.

7. **Export** — press **Export**, choose the format and quality in the dialog,
   and submit. The download starts from the dialog, not from the first click.

### Scenario B — batch-style work with the Pipeline

The Pipeline panel lets you queue several operations and apply them in one
pass. This is the closest thing to batch processing the product has today.

1. Open the **Pipeline** panel on an uploaded photo.
2. Add nodes: e.g. brightness → sharpen → median-filter (for noise).
3. **Preview** runs the whole chain from History index 0 and shows a
   non-destructive result — your current image is untouched.
4. **Apply** executes the chain, reusing a cache when parameters repeat, and
   records exactly one History entry.

### Scenario C — background removal and smart crop

1. **Background Studio** — pick the key color (or use the eyedropper on the
   image), tune tolerance and feather, then **Preview mask** / **Preview
   replacement**. Previews never mutate the image; **Remove background** and
   **Replace background** are the committing actions.
2. **Smart Crop** — choose an aspect ratio, **Preview framing** to see the
   saliency-based proposal, then **Apply framing** to commit it.

---

## 4. Verifying what the server actually did

The UI is one view; the API is another. If something looks wrong in the
editor, check the server side directly — this is how we separate a frontend
rendering bug from a backend processing bug.

```bash
# inspect one image's history
curl "http://localhost:5000/api/history?image_id=<ID>" | python -m json.tool

# run the quality analysis directly
curl -X POST "http://localhost:5000/api/analysis" \
  -H "Content-Type: application/json" \
  -d '{"image_id": "<ID>"}' | python -m json.tool

# fetch the current bytes and open them
curl "http://localhost:5000/api/images/<ID>/content" -o current.png

# every response carries the error contract; a failure looks like this:
# {"success": false, "error": {"code": "...", "message": "..."}}
```

There is no list-sessions endpoint — `POST /api/images` uploads and `GET
/api/images/<ID>/content` fetches bytes, but nothing enumerates sessions. To
find an ID you forgot, read the SQLite database directly:

```bash
python -c "import sqlite3; print(sqlite3.connect('instance/intellicanvas.sqlite3').execute('SELECT image_id, original_filename FROM image_sessions').fetchall())"
```

The response **never contains a filesystem path** — this is enforced
structurally by `OperationResult`, not by convention. If you ever see a
`path` key in an API response, that is a real bug.

---

## 5. Running the test suites

Everything below should pass on a clean checkout. If one does not, that is a
bug to report, not an environment quirk — each was verified on `18dc879`.

```bash
# backend (283 tests)
pytest -q

# lint and formatting
ruff check backend tests
ruff format --check backend tests

# frontend unit tests (52 tests, jsdom-backed)
npm run test:frontend

# browser smoke against a live server (2 tests)
python backend/run.py &          # in one terminal
npx playwright test              # in another
```

The browser test drives the full path — upload, adjust, apply, undo, export —
against a real browser, so a broken upload cannot hide behind a passing unit
test. It accepts the Playwright-hosted Chromium or a system Chrome.

---

## 6. What to do if something breaks

| Symptom | Check first |
|---|---|
| Editor loads but tools do nothing | `/api/health` — is the backend up? |
| Upload spins forever | The file may be invalid; check the server console for `INVALID_FILE` |
| Operation 404s | The operation is not in `/api/capabilities`; the UI should disable it |
| "session expired" toast | Sessions are stored in SQLite; restarting the server keeps them, but a fresh DB path drops them |
| Tests fail locally but not in CI | Run `npm install` and `pip install -r backend/requirements-dev.txt` again |

The database path is set by `backend/app/config.py`. Data persists between
restarts; deleting that file is the way to reset all sessions.

---

## 7. Where the boundaries are

Implemented and testable now: upload, adjustments, filters, background
studio, history with before/after and diff maps, pipelines, quality
analysis, smart suggestions, explain-operation, smart crop, layers, and
capability discovery.

**Not implemented:** ownership/authentication, multiple selection and
grouping, per-layer filters, AI segmentation, and the product features on the
v0.9.1 roadmap (Auto Enhance, Presets, Profiles, Quality Gates, Batch). Any
document describing those describes a plan, not a running capability.
