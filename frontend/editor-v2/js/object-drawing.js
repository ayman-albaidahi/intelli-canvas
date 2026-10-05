/**
 * Object rendering, split out of ObjectManager.
 *
 * ObjectManager owned drawing, interaction, layer CRUD and creation in one
 * 821-line class. The drawing block is the part that is genuinely about the
 * canvas context rather than about editor state: given a context, a list of
 * objects and a way to turn image coordinates into screen coordinates, it
 * has no other dependency on the manager.
 *
 * Each exported function takes the geometry helpers it needs as an explicit
 * `geo` object instead of reaching for `this`, so the seam is visible in the
 * signature. `drawShape` needs nothing at all and is pure.
 */

import { DEFAULT_ACCENT_STRONG, themeColor } from './theme-colors.js';

const TEXT_FONT = '600 %{size}px Inter, "Segoe UI", Tahoma, sans-serif';

/**
 * Paint one shape object. Assumes the caller has already translated to the
 * object centre and applied rotation; this draws in object space.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 */
export function drawShape(ctx, o) {
  const half = { x: o.w / 2, y: o.h / 2 };
  ctx.lineWidth = o.strokeWidth;
  ctx.strokeStyle = o.stroke;
  ctx.fillStyle = o.fill;
  ctx.beginPath();
  if (o.shape === 'ellipse') ctx.ellipse(0, 0, half.x, half.y, 0, 0, Math.PI * 2);
  else if (o.shape === 'line') {
    ctx.moveTo(-half.x, half.y);
    ctx.lineTo(half.x, -half.y);
  } else if (o.shape === 'arrow') {
    ctx.moveTo(-half.x, half.y);
    ctx.lineTo(half.x, -half.y);
    const head = Math.min(18, o.w / 4);
    const angle = Math.atan2(-o.h, o.w);
    ctx.moveTo(half.x, -half.y);
    ctx.lineTo(half.x - head * Math.cos(angle - 0.5), -half.y - head * Math.sin(angle - 0.5));
    ctx.moveTo(half.x, -half.y);
    ctx.lineTo(half.x - head * Math.cos(angle + 0.5), -half.y - head * Math.sin(angle + 0.5));
  } else ctx.rect(-half.x, -half.y, o.w, o.h);
  if (o.fillOn && o.shape !== 'line' && o.shape !== 'arrow') ctx.fill();
  ctx.stroke();
}

/**
 * Paint a brush stroke. Strokes are stored in image coordinates and are
 * projected to screen coordinates here, so the caller's generic object
 * transform must not also be applied or the stroke is displaced from the
 * pointer.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 * @param {object} geo `{ centerOf(o), imageToScreen(x, y) }`
 */
export function drawBrushStroke(ctx, stroke, geo) {
  const c = stroke.x !== undefined ? geo.centerOf(stroke) : { x: 0, y: 0 };
  const screenC = geo.imageToScreen(c.x, c.y);
  const points = stroke.pointsRel || stroke.points;
  const screenPoints = points.map(([px, py]) => {
    const s = geo.imageToScreen(c.x + px, c.y + py);
    return [s.x - screenC.x, s.y - screenC.y];
  });
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  // An erasing stroke composites a hole into everything drawn before it on
  // this canvas. The stored blend stays a supported mode for the API; only
  // the on-canvas composite uses destination-out.
  ctx.globalCompositeOperation = stroke.erasing ? 'destination-out' : stroke.blend || 'source-over';
  ctx.translate(screenC.x, screenC.y);
  ctx.rotate(((stroke.rotation || 0) * Math.PI) / 180);
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  screenPoints.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * Paint one object in screen space.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {object} geo `{ centerOf(o), imageToScreen(x, y) }`
 */
export function drawObject(ctx, o, geo) {
  const c = geo.centerOf(o);
  ctx.save();
  ctx.globalAlpha = o.opacity;

  if (o.type === 'brush') {
    drawBrushStroke(ctx, { ...o, points: o.pointsRel }, geo);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = o.blend || 'source-over';
  ctx.translate(c.x, c.y);
  ctx.rotate((o.rotation * Math.PI) / 180);
  if (o.type === 'image') ctx.drawImage(o.img, -o.w / 2, -o.h / 2, o.w, o.h);
  else if (o.type === 'text') {
    ctx.font = TEXT_FONT.replace('%{size}', o.fontSize);
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'middle';
    if (o.rtl) {
      ctx.direction = 'rtl';
      ctx.fillText(o.text, o.w / 2 - 6, 0);
    } else ctx.fillText(o.text, -o.w / 2 + 6, 0);
  } else if (o.type === 'shape') drawShape(ctx, o);
  ctx.restore();
}

/**
 * Paint every object into an export-sized context, in image coordinates.
 * This is the path used by PNG/JPEG export, so it must not depend on the
 * on-screen transform; the scale factors map image units to output pixels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} objects
 * @param {object} imageRect
 * @param {number} outputWidth
 * @param {number} outputHeight
 * @param {object} geo `{ centerOf(o) }`
 */
export function renderExport(ctx, objects, imageRect, outputWidth, outputHeight, geo) {
  const scaleX = outputWidth / imageRect.width;
  const scaleY = outputHeight / imageRect.height;
  for (const object of objects) {
    if (!object.visible) continue;
    const center = geo.centerOf(object);
    ctx.save();
    ctx.globalAlpha = object.opacity;
    ctx.globalCompositeOperation = object.erasing
      ? 'destination-out'
      : object.blend || 'source-over';
    ctx.translate((center.x - imageRect.x) * scaleX, (center.y - imageRect.y) * scaleY);
    ctx.rotate((object.rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    if (object.type === 'image') {
      ctx.drawImage(object.img, -object.w / 2, -object.h / 2, object.w, object.h);
    } else if (object.type === 'text') {
      ctx.font = TEXT_FONT.replace('%{size}', object.fontSize);
      ctx.fillStyle = object.color;
      ctx.textBaseline = 'middle';
      if (object.rtl) {
        ctx.direction = 'rtl';
        ctx.fillText(object.text, object.w / 2 - 6, 0);
      } else ctx.fillText(object.text, -object.w / 2 + 6, 0);
    } else if (object.type === 'shape') {
      drawShape(ctx, object);
    } else if (object.type === 'brush') {
      ctx.strokeStyle = object.color;
      ctx.lineWidth = object.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      (object.pointsRel || []).forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Paint the dashed selection box, resize handles and rotate handle for one
 * object, plus the live angle readout when a rotation is in progress.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {object} geo `{ centerOf(o), handles(o), rotateHandle(o) }`
 * @param {string|null} angleReadout
 */
export function drawSelection(ctx, o, geo, angleReadout) {
  const c = geo.centerOf(o);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.strokeStyle = themeColor('--accent-strong', DEFAULT_ACCENT_STRONG);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(-o.w / 2 - 2, -o.h / 2 - 2, o.w + 4, o.h + 4);
  ctx.setLineDash([]);
  if (!o.locked) {
    ctx.fillStyle = '#ffffff';
    for (const h of geo.handles(o)) {
      const lx = h.sx * (o.w / 2 + 2);
      const ly = h.sy * (o.h / 2 + 2);
      ctx.fillRect(lx - 4.5, ly - 4.5, 9, 9);
      ctx.strokeRect(lx - 4.5, ly - 4.5, 9, 9);
    }
    const rot = { x: 0, y: -o.h / 2 - 24 };
    ctx.beginPath();
    ctx.moveTo(0, -o.h / 2 - 2);
    ctx.lineTo(rot.x, rot.y + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (angleReadout) {
    const rot = geo.rotateHandle(o);
    ctx.save();
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = themeColor('--accent-strong', DEFAULT_ACCENT_STRONG);
    ctx.fillText(angleReadout, rot.x + 12, rot.y);
    ctx.restore();
  }
}

/**
 * Paint the dashed rectangle shown while dragging out a new shape.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} current
 * @param {string} color
 */
export function drawShapePreview(ctx, start, current, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    Math.min(start.x, current.x),
    Math.min(start.y, current.y),
    Math.abs(current.x - start.x),
    Math.abs(current.y - start.y),
  );
  ctx.restore();
}
