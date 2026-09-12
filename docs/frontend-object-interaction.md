# Object Interaction — IntelliCanvas

This stage upgrades the drawing overlay from flat marks to frontend-managed objects. Rectangle and text objects are stored with position and dimensions, can be selected by clicking, moved by dragging, and deleted with Delete or Backspace. A visible rose selection outline indicates the active object. Brush and eraser remain raster strokes on the object canvas.

The implementation remains limited to HTML, CSS, JavaScript, and Canvas API. It does not yet persist object geometry to the backend, and resize handles and rotation handles are reserved for the next interaction refinement.

Verify by opening the editor locally, drawing a rectangle or adding text, switching to Select, clicking the object, dragging it, and pressing Delete. Confirm the layers panel receives the corresponding layer entries.
