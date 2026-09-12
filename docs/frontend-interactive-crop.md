# Interactive Crop Tool — IntelliCanvas

## Scope

This stage replaces the temporary center-crop shortcut with an interactive crop workflow on top of the merged Canvas and transform stages. It remains a pure HTML, CSS, JavaScript, and native Canvas API implementation.

## Included

Selecting Crop activates a visible crop rectangle over the rendered image. The rectangle can be dragged within the image bounds and shows a rule-of-thirds guide plus the current preview dimensions. Apply Crop commits the selected viewport to the canvas manager and creates an Undo snapshot. Reset restores the initial inset selection, while Cancel exits without changing the image. The crop controls are presented in a compact floating action bar inside the canvas workspace.

The crop geometry is isolated in `crop-tool.js`, while pixel viewport state remains in `canvas-manager.js`. This keeps the future resize handles and aspect-ratio options localized to the crop tool rather than coupling them to the application shell.

## Verification

Open `frontend/editor-v2/index.html` through a local static server and choose an image. Select Crop from the left rail, drag the crop rectangle, and confirm that its dimensions update. Test Reset, Cancel, Apply Crop, and Undo. Confirm that rotation, flip, zoom, pan, and Fit remain available outside crop mode.

## Limitation

This stage supports moving the crop rectangle but not corner resize handles or aspect-ratio locking yet. Those are planned for the next crop refinement pass alongside explicit keyboard escape handling.
