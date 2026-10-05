// Pure geometry helpers for editor objects.
//
// These take an object and coordinates and return positions with no reference
// to the DOM, the canvas, or any manager state, which is what makes them
// unit-testable in jsdom and reusable outside ObjectManager. They were
// inlined there originally; keeping them here keeps the coordinate math in
// one place — hit-testing, handle placement and stroke normalisation all
// agree because they share these.

export function centerOf(o) {
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}

export function toLocal(o, px, py) {
  const c = centerOf(o);
  const rad = -o.rotation * Math.PI / 180;
  const dx = px - c.x;
  const dy = py - c.y;
  return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
}

export function rotateOffset(o, lx, ly) {
  const rad = o.rotation * Math.PI / 180;
  return { x: lx * Math.cos(rad) - ly * Math.sin(rad), y: lx * Math.sin(rad) + ly * Math.cos(rad) };
}

export function hitObject(objects, px, py) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (!o.visible || o.locked) continue;
    const local = toLocal(o, px, py);
    if (Math.abs(local.x) <= o.w / 2 + 2 && Math.abs(local.y) <= o.h / 2 + 2) return o;
  }
  return null;
}

export function handles(o) {
  if (!o) return [];
  const signs = [[-1, -1, 'nw'], [0, -1, 'n'], [1, -1, 'ne'], [1, 0, 'e'], [1, 1, 'se'], [0, 1, 's'], [-1, 1, 'sw'], [-1, 0, 'w']];
  return signs.map(([sx, sy, key]) => {
    const local = { x: (sx * o.w) / 2, y: (sy * o.h) / 2 };
    const screen = rotateOffset(o, local.x, local.y);
    const c = centerOf(o);
    return { key, sx, sy, x: c.x + screen.x, y: c.y + screen.y };
  });
}

export function rotateHandle(o) {
  const c = centerOf(o);
  const top = rotateOffset(o, 0, -o.h / 2 - 24);
  return { x: c.x + top.x, y: c.y + top.y };
}

/**
 * Fit the stroke box (x/y/w/h) to the stroke's points, padding by half the
 * stroke width so the endpoints are not clipped, and rewrite the relative
 * points against the new centre. Mutates `stroke`.
 *
 * @param {object} stroke `{ points: [[x, y]], strokeWidth }` in image space
 * @param {number} [minSize]
 */
export function normalizeStrokeBox(stroke, minSize = 8) {
  const xs = stroke.points.map((p) => p[0]);
  const ys = stroke.points.map((p) => p[1]);
  const pad = stroke.strokeWidth / 2 + 2;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  stroke.x = minX;
  stroke.y = minY;
  stroke.w = Math.max(minSize, maxX - minX);
  stroke.h = Math.max(minSize, maxY - minY);
  const cx = stroke.x + stroke.w / 2;
  const cy = stroke.y + stroke.h / 2;
  stroke.pointsRel = stroke.points.map(([px, py]) => [px - cx, py - cy]);
}

/**
 * Resize `o` by dragging one of its handles to `point`.
 *
 * `drag` is the resize gesture captured at pointerdown: the handle being
 * dragged and the opposite anchor `{sx, sy}` (signs of ±1 / 0), the box the
 * object had then (`startX/Y`, `startW/H`, `startStrokeWidth`), and the
 * anchor's then-current world position (`anchorScreen`). Mutates `o`.
 *
 * The geometry: screen offsets are un-rotated into the object's local frame
 * so an arbitrarily rotated box behaves like an axis-aligned one; the new
 * size is the distance from the anchor in that frame; the object position is
 * solved backwards so the anchor lands exactly where it was — a resize must
 * never slide the object out from under the held corner. Corner drags with
 * `keepRatio` lock the starting aspect ratio by growing the shorter axis.
 * For brush strokes the relative points and line width scale with the box so
 * the painted curve deforms with its selection rather than drifting inside it.
 *
 * @param {object} o
 * @param {object} drag
 * @param {{x: number, y: number}} point
 * @param {boolean} keepRatio
 * @param {number} [minSize]
 */
export function resizeObjectFromDrag(o, drag, point, keepRatio, minSize = 8) {
  const { handle, anchor } = drag;
  const startCenter = { x: drag.startX + drag.startW / 2, y: drag.startY + drag.startH / 2 };
  const rad = -o.rotation * Math.PI / 180;
  const dx = point.x - startCenter.x;
  const dy = point.y - startCenter.y;
  const local = { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
  const anchorStart = { x: (anchor.sx * drag.startW) / 2, y: (anchor.sy * drag.startH) / 2 };
  let newW = drag.startW;
  let newH = drag.startH;
  if (handle.sx !== 0) newW = Math.max(minSize, Math.abs(local.x - anchorStart.x));
  if (handle.sy !== 0) newH = Math.max(minSize, Math.abs(local.y - anchorStart.y));
  if (keepRatio && handle.sx !== 0 && handle.sy !== 0) {
    const ratio = drag.startH / drag.startW;
    if (newW / drag.startW > newH / drag.startH) newH = Math.max(minSize, newW * ratio);
    else newW = Math.max(minSize, newH / ratio);
  }
  o.w = Math.round(newW);
  o.h = Math.round(newH);
  const anchorNew = { x: (anchor.sx * o.w) / 2, y: (anchor.sy * o.h) / 2 };
  const anchorRotated = rotateOffset(o, anchorNew.x, anchorNew.y);
  o.x = Math.round(drag.anchorScreen.x - anchorRotated.x - o.w / 2);
  o.y = Math.round(drag.anchorScreen.y - anchorRotated.y - o.h / 2);
  if (o.type === 'brush' && o.pointsRel && drag.startW && drag.startH) {
    const kx = o.w / drag.startW;
    const ky = o.h / drag.startH;
    o.pointsRel = o.pointsRel.map(([px, py]) => [px * kx, py * ky]);
    o.strokeWidth = Math.max(1, Math.round((drag.startStrokeWidth || o.strokeWidth) * ((kx + ky) / 2)));
  }
}
