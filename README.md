# IntelliCanvas

> Interactive & Intelligent Web-Based Image Editor

IntelliCanvas is a web-based interactive image editor that combines image editing, digital image processing, image compositing, background manipulation, and intelligent visual assistance in a unified environment.

## Vision

The goal of IntelliCanvas is to provide a practical and extensible image editing platform that goes beyond basic filters and transformations by combining professional editing workflows with explainable image processing and intelligent assistance.

## Core Capabilities

- Image upload and export
- Image format conversion
- Crop, resize, rotate, and flip
- Drawing, shapes, and text
- Pixel-level image enhancement
- Filters and image processing operations
- Histogram analysis
- Edge detection
- Morphological operations
- Multiple-image compositing
- Layer-based editing
- Background removal and replacement
- Product background library
- Undo / Redo
- Visual editing history
- Before / After comparison
- Difference visualization
- Processing pipelines
- Image quality analysis
- Smart editing suggestions
- Explainable image processing operations

## Technology Stack

### Frontend
- HTML
- CSS
- JavaScript
- HTML5 Canvas API

### Backend
- Python
- Flask
- REST API

### Image Processing
- OpenCV
- NumPy
- Pillow

### Database
- SQLite

## Project Structure

The project is organized into separate frontend, backend, documentation, and testing components to support maintainability and collaborative development.

## Development

This project is developed collaboratively using GitHub with:

- Issues
- Project Boards
- Feature Branches
- Pull Requests
- Code Reviews
- Releases

To install the development dependencies and run the backend checks from the
repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
pytest -q
ruff check backend tests
python backend/run.py
```

The runtime stores image-session metadata, editing history, and layer models in
SQLite at `instance/intellicanvas.sqlite3` by default. Set
`INTELLICANVAS_DATABASE_PATH` to use another database file. Image binaries
remain in the configured file-storage directories, including image-layer assets
under the `layer-assets` storage category.

The preferred editor URL is `http://localhost:5000/editor-v2/`. The root URL
serves the same editor.

## Project Status

🚧 Under Development

## Team

A three-member development team.

## License

MIT License
