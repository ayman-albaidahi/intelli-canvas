# Frontend Transform Tools — IntelliCanvas

## Scope

This stage builds on the confirmed merged Canvas workspace from PR #46. It remains a pure frontend implementation using HTML, CSS, JavaScript, and the native Canvas API; no backend or API code is involved.

## Included

The canvas manager now tracks rotation, horizontal and vertical flips, a crop viewport, and a bounded local history. Rotate-left and rotate-right controls apply 90-degree rotations. Flip controls mirror the rendered image. The existing Crop tool supports a safe center-crop preview on double click. Undo and Redo restore transform snapshots without reloading the source file.

The changes are intentionally kept inside the existing `frontend/editor-v2/` boundary. `transform-tools.js` owns event wiring and user feedback, while `canvas-manager.js` owns the render state and history operations.

## Verification

Open `frontend/editor-v2/index.html` through a local static server, choose an image, and test the rotate, flip, zoom, pan, and Fit controls. Double-click Crop to apply the current center-crop preview. Test Undo and Redo after several operations. The document and image remain local; no network request is made.

## Limitation for this stage

Crop is currently a deterministic center-crop preview rather than an interactive drag rectangle. The next interaction stage will replace it with a resizable selection overlay and explicit Apply/Cancel controls.
