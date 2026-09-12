# Fix: Choose Image and IntelliCanvas Branding

## Choose image

The image and object canvases are absolutely positioned over the empty-state content. Their stacking order intercepted pointer events before the `Choose image` button could receive a click. The empty-state panel now has a positioned stacking layer above the canvas overlays, so the existing file-picker action is clickable on first load.

## Logo

The supplied IntelliCanvas logo is included at `frontend/editor-v2/assets/intellicanvas-logo.png`. It is now used in the editor brand area and registered as the page favicon. The original brand text remains available beside it for a clear workspace identity.

## Scope

No backend, API, external library, or image-processing code was changed.
