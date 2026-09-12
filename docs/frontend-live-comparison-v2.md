# Live Split-Screen Comparison v2 — IntelliCanvas

This is a clean rebuild of the live comparison feature from the latest `main` after PR #54 was closed. It includes only the comparison additions and is intentionally based on the main branch that already contains the IntelliCanvas logo and the Choose image fix.

The Compare control opens an Original/Edited workspace overlay. Both previews use the loaded local image and remain aligned. A transparent range slider controls the horizontal divider and clips the edited preview. The edited side currently uses a browser-side saturation and contrast preview until frontend adjustments and API output are connected.

The implementation is isolated in `comparison-tool.js` and `comparison.css`. It uses native HTML, CSS, JavaScript, and Canvas APIs only.

Verify by loading an image, pressing Compare, dragging the divider, and pressing Compare again to close the overlay.
