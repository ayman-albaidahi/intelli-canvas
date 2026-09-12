# Live Split-Screen Comparison — IntelliCanvas

This stage adds a native frontend comparison view. The Compare button opens a full workspace overlay with Original and Edited preview canvases. A transparent range control captures horizontal dragging, updates the divider position, clips the edited side, and keeps both previews aligned. The edited preview currently applies a lightweight browser-side saturation and contrast treatment as a stand-in for future filter or API output.

The comparison controller is isolated in `comparison-tool.js` and reads the loaded source image through the canvas manager. No backend request or external library is used.

Verify by loading an image, pressing Compare, dragging the center divider, and confirming both labels and synchronized preview placement. Press Compare again to close the view.

The next filter stage will replace the preview treatment with the current adjustment state so the comparison reflects real frontend operations.
