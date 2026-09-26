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
