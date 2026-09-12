# Drawing and Objects — IntelliCanvas

## Scope

This stage adds the first visible drawing and object interactions on top of the merged layer system. It uses only HTML, CSS, JavaScript, and native Canvas APIs.

## Included

A dedicated object canvas now sits above the image canvas. Brush strokes use the selected rose color and adjustable brush size. Eraser uses the Canvas destination-out composite mode. Shape mode draws rectangle outlines, and Text mode prompts for text and renders it at the clicked position. Each created shape or text object adds a corresponding layer entry. The object canvas becomes interactive only for drawing tools, preserving pan behavior for Select and Move.

The drawing and object event logic is isolated in `object-manager.js`; the existing image canvas remains responsible for image viewing, transforms, crop, and resize.

## Verification

Open the editor through a local static server, select Brush, draw a stroke, and adjust Brush size and color in Properties. Select Eraser and remove part of a stroke. Select Shapes and drag a rectangle. Select Text and click the canvas, enter text, and confirm it appears with a new layer. Switch back to Select and confirm pan continues to work.

## Limitation

Objects are currently rendered on a dedicated frontend overlay canvas and are not yet individually selectable or transformable. The next object interaction pass will add object hit-testing, selection bounds, move/resize handles, and deletion.
