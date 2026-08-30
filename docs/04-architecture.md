# IntelliCanvas — System Architecture

## 1. Architecture Overview

IntelliCanvas follows a modular client-server architecture.

The system is divided into:

* Frontend Layer
* API Layer
* Application Services Layer
* Image Processing Engine
* Storage Layer
* Database Layer

The architecture is designed to keep the user interface, business logic, image-processing algorithms, and data management separated.

---

## 2. High-Level Architecture

```text
                         IntelliCanvas
                              │
                              ▼
                    ┌───────────────────┐
                    │     Frontend      │
                    │ HTML / CSS / JS   │
                    │   Canvas API      │
                    └─────────┬─────────┘
                              │
                         HTTP / REST
                              │
                              ▼
                    ┌───────────────────┐
                    │    Flask API      │
                    │   API / Routes    │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Application       │
                    │ Services          │
                    └─────────┬─────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   Image Processing Engine    │
              │                               │
              │ OpenCV / NumPy / Pillow       │
              └───────────────┬───────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        ┌─────────────────┐       ┌─────────────────┐
        │ File Storage    │       │    Database     │
        │                 │       │                 │
        │ Images / Assets │       │ SQLite          │
        └─────────────────┘       └─────────────────┘
```

---

# 3. Frontend Architecture

The frontend is responsible for the interactive editing experience.

## Technologies

* HTML
* CSS
* JavaScript
* HTML5 Canvas API

## Responsibilities

The frontend handles:

* User interface
* Image preview
* Canvas interaction
* Drawing
* Object manipulation
* Layer interface
* Zoom and navigation
* Editing controls
* Before/After comparison
* Visual history
* Communication with the backend API

---

## 3.1 Frontend Components

```text
frontend/
│
├── index.html
│
├── css/
│   ├── main.css
│   └── editor.css
│
├── js/
│   ├── main.js
│   ├── api.js
│   ├── canvas-manager.js
│   ├── layer-manager.js
│   ├── history-stack.js
│   ├── pipeline-manager.js
│   │
│   └── tools/
│       ├── crop-tool.js
│       ├── draw-tool.js
│       ├── filter-panel.js
│       └── background-tool.js
│
└── assets/
    └── icons/
```

---

# 4. Backend Architecture

The backend provides the API and coordinates image-processing operations.

## Technology

* Python
* Flask
* REST API

## Responsibilities

The backend handles:

* File uploads
* File validation
* Image processing
* Image conversion
* Background processing
* Image analysis
* Processing pipelines
* Saving processed images
* Database operations
* API responses

---

# 5. Backend Layers

The backend is divided into three main logical components:

```text
Routes
  ↓
Services
  ↓
Utilities / External Libraries
```

---

## 5.1 Routes

Routes define the API endpoints.

Example:

```text
POST /api/images/upload
POST /api/images/crop
POST /api/images/resize
POST /api/images/filter
POST /api/images/background/remove
POST /api/images/merge
GET  /api/images/history
```

Routes should not contain complex image-processing logic.

Their responsibility is to:

1. Receive the request.
2. Validate the request.
3. Call the appropriate service.
4. Return the response.

---

## 5.2 Services

Services contain the actual application and image-processing logic.

Example:

```text
services/
│
├── image_io.py
├── geometry_service.py
├── pixel_service.py
├── filter_service.py
├── background_service.py
├── merge_service.py
├── layer_service.py
├── analysis_service.py
└── pipeline_service.py
```

Each service should have a focused responsibility.

---

# 6. Image Processing Engine

The image-processing engine is one of the most important components of IntelliCanvas.

It will use:

* OpenCV
* NumPy
* Pillow

## OpenCV

Used for:

* Filtering
* Edge detection
* Morphological operations
* Image transformations
* Histogram processing
* Computer vision operations

## NumPy

Used for:

* Pixel-level manipulation
* Matrix operations
* Numerical calculations
* Image arrays

## Pillow

Used for:

* Image loading
* Image saving
* Format conversion
* Basic image manipulation
* Metadata handling

---

# 7. Image Processing Flow

A typical processing request follows this flow:

```text
User
 │
 ▼
Frontend
 │
 │ HTTP Request
 ▼
Flask API
 │
 ▼
Route
 │
 ▼
Service
 │
 ▼
OpenCV / NumPy / Pillow
 │
 ▼
Processed Image
 │
 ▼
Storage
 │
 ▼
API Response
 │
 ▼
Frontend
 │
 ▼
Canvas Update
```

---

# 8. Storage Architecture

The system will initially use local file storage.

```text
backend/
│
└── storage/
    ├── uploads/
    ├── processed/
    └── backgrounds/
```

## uploads

Stores original uploaded images.

## processed

Stores generated or exported image results when required.

## backgrounds

Stores predefined background assets.

---

# 9. Database

The initial database will be SQLite.

The database will store application metadata rather than raw image files.

Potential entities include:

```text
Project
Image
Layer
Operation
Pipeline
History
Background
```

The exact database schema will be defined separately in the ERD.

---

# 10. Layer System

Layers are a core component of the editor.

A composition may contain:

```text
Canvas
│
├── Background Layer
│
├── Image Layer
│
├── Product Layer
│
├── Text Layer
│
└── Shape Layer
```

Each layer may have properties such as:

* Position
* Size
* Rotation
* Opacity
* Visibility
* Z-index
* Type

The frontend will provide interactive manipulation while the backend will handle persistent or final image composition operations when required.

---

# 11. History System

The editor will maintain an editing history.

```text
Original
   ↓
Crop
   ↓
Brightness
   ↓
Blur
   ↓
Sharpen
```

The frontend will manage fast interactive Undo/Redo operations.

The backend may store persistent history information when required.

---

# 12. Processing Pipeline

The Processing Pipeline represents image processing as a sequence of operations.

Example:

```text
Original Image
      │
      ▼
Resize
      │
      ▼
Brightness
      │
      ▼
Gaussian Blur
      │
      ▼
Sharpen
      │
      ▼
Final Image
```

Each operation may contain:

* Operation type
* Parameters
* Order
* Enabled/Disabled state

Example:

```json
{
  "operation": "brightness",
  "parameters": {
    "value": 20
  },
  "enabled": true
}
```

The pipeline architecture allows operations to be modified, disabled, removed, or reordered.

---

# 13. Background Processing

Background functionality consists of:

```text
Original Image
      │
      ▼
Background Detection
      │
      ▼
Foreground / Background Mask
      │
      ▼
Background Removal
      │
      ▼
New Background
      │
      ▼
Final Composition
```

The system may use specialized background-removal libraries or models when appropriate.

The selected implementation will be evaluated based on project constraints and performance.

---

# 14. Image Analysis

The analysis service will inspect image characteristics.

Potential metrics include:

* Brightness
* Contrast
* Sharpness
* Noise
* Resolution
* Histogram

Example:

```text
Image Analysis
│
├── Brightness: Medium
├── Contrast: Low
├── Sharpness: High
└── Noise: Medium
```

These results may later be used by the intelligent assistance system.

---

# 15. Intelligent Assistance Architecture

Advanced intelligent features will be built on top of the image analysis layer.

```text
Image
 │
 ▼
Image Analysis
 │
 ▼
Detected Characteristics
 │
 ▼
Recommendation Engine
 │
 ├── Suggest Filter
 ├── Suggest Enhancement
 ├── Suggest Crop
 └── Suggest Processing Pipeline
```

The intelligent layer should not directly modify the image without user confirmation.

The user remains in control of the final operation.

---

# 16. API Design Principles

The API should follow REST-style principles.

Example endpoints:

```text
/api/images
/api/images/upload
/api/images/export

/api/transform/crop
/api/transform/resize
/api/transform/rotate
/api/transform/flip

/api/process/grayscale
/api/process/brightness
/api/process/contrast
/api/process/blur
/api/process/sharpen

/api/background/remove
/api/background/replace

/api/layers
/api/history
/api/pipeline
/api/analysis
```

The final API endpoint structure will be documented in:

```text
docs/API_endpoints.md
```

---

# 17. Error Handling

The system should provide clear error responses.

Example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "The uploaded file is not a supported image."
  }
}
```

The frontend should display user-friendly error messages.

---

# 18. Security Considerations

The system should:

* Validate uploaded file types.
* Limit upload sizes.
* Sanitize file names.
* Prevent unsafe file paths.
* Avoid exposing internal server paths.
* Validate API input.
* Keep secrets outside source code.
* Use environment variables for sensitive configuration.

---

# 19. Architectural Principles

The project will follow these principles:

### Separation of Concerns

Each component should have a clearly defined responsibility.

### Modularity

Image-processing operations should be implemented as independent services.

### Extensibility

New operations should be added without major changes to the existing architecture.

### Maintainability

Code should be readable, organized, and documented.

### Testability

Important services should be independently testable.

### User Control

Intelligent features should assist the user rather than silently modify the image.

---

# 20. Architecture Evolution

The architecture is intentionally designed to evolve.

### Initial System

```text
Frontend
   ↓
Flask API
   ↓
Image Processing
   ↓
Storage
```

### Expanded System

```text
Frontend
   ↓
Flask API
   ↓
Application Services
   ↓
Image Processing Engine
   ├── Core Processing
   ├── Background Processing
   ├── Analysis
   └── Intelligence
          ↓
      Suggestions
```

The architecture should support future expansion without requiring a complete rewrite of the system.
