# Phase 3 — Real Layers & Unified Objects — IntelliCanvas

This stage replaces the mock layer list and the ad-hoc drawing code with one unified object system that drives both the canvas and the layers panel.

## Unified object model

Every canvas element is an object with `id, type, name, x, y, w, h, rotation, opacity, blend, visible, locked`. Supported types: **brush** (stored as a rescalable point path), **shape** (rectangle, ellipse, line, arrow with fill/stroke), **text** (measured, Arabic/RTL aware), and **image** (a real image layer added through the Layers panel). The object canvas renders the whole model every frame, so resize, zoom and panel changes no longer destroy strokes.

## Selection & transform

In Select/Move tools an object shows a dashed bounding box, eight resize handles and a rotation handle. Dragging the body moves it; corner/edge handles resize around the fixed opposite anchor (with aspect-ratio lock via Shift); the rotation handle orbits the object with a live angle readout (Shift snaps to 15°). Locked objects are skipped by hit-testing and cannot be moved; hidden objects neither render nor hit. Arrow keys nudge, Delete removes, double-click on a text layer re-edits its content.

## Layers panel

Each row shows a type glyph, editable name, type label, visibility toggle, lock toggle and an actions menu (Duplicate, Rename, Bring to front, Send to back, Delete). Rows drag to reorder with a drop indicator; the panel binds to the object model, so canvas selection highlights the row and vice versa. The panel header offers Add Image / Add Shape / Add Text.

## Inspector properties

Selecting an object swaps the empty panel for a property editor: name, X/Y/W/H, rotation, an opacity slider with live percentage and a blend-mode selector (Normal, Multiply, Screen, Overlay, Darken, Lighten), plus Duplicate and Delete shortcuts. Fields disable while the layer is locked.

## Deferred (next iterations)

Multi-select, grouping, snapping/alignment guides, per-layer canvas thumbnails, an inline (non-prompt) text editor and object-level undo — these build on this model and are queued for the following stage together with the History system.

## Verification

Verified live: creating shape/text/image layers from the panel, selecting from rows and canvas, moving, anchored resize (+70/+50 exactly), rotation to 53°, lock blocking movement with disabled fields, Arabic rename, duplicate, bring-to-front/send-to-back ordering, visibility toggling, opacity and blend application, Delete-key removal — alongside the 116 backend tests.
