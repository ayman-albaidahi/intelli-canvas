# Adjustments and Filters — IntelliCanvas

This stage adds live frontend image adjustments using the native Canvas 2D `filter` pipeline. The Properties panel now exposes Brightness, Contrast, Saturation, Blur, Grayscale, and Negative controls. Every slider or toggle updates the image preview immediately, while Reset restores a neutral image. Adjustment state is included in the existing local history snapshots so future undo and redo can restore it.

The controller is isolated in `adjustments-manager.js`; the canvas manager remains responsible for rendering and filter state. No backend, API, or third-party library is used.

Verify by loading an image, changing each slider, toggling Grayscale and Negative, checking the live canvas response, using Reset, and confirming the existing Compare, Crop, Rotate, Flip, Resize, Brush, Text, and Layers controls remain available.

The next processing stage can extend the same state with Gamma, Hue, Threshold, Histogram, Gaussian Blur, Sharpen, Sobel, Laplacian, and Morphology controls.
