import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ObjectManager } from './object-manager.js';
import { setState } from './app-state.js';

// The interaction machine moved out of ObjectManager into
// object-interaction.js; these tests drive it through the manager's own
// surface (objectManager.interaction) because the machine only works as a
// collaborator: it reads app state and mutates the manager. The canvas and
// listeners are stand-ins, exactly as in object-manager.test.js — what is
// under test is the gesture logic, not the DOM.

const NOOP_CTX = new Proxy({}, { get: () => () => {} });

function fakeCanvas({ width = 800, height = 600 } = {}) {
  return {
    width,
    height,
    style: {},
    parentElement: { getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    getContext: () => NOOP_CTX,
    setPointerCapture: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

const cm = {
  image: {},
  documentSize: { width: 800, height: 600 },
  scale: 1,
  rotation: 0,
  flipX: 1,
  flipY: 1,
  offset: { x: 400, y: 300 },
  hasImage: () => true,
};

function makeShape(overrides = {}) {
  return {
    id: 'shape-1',
    type: 'shape',
    shape: 'rect',
    name: 'Shape 1',
    x: 100,
    y: 100,
    w: 100,
    h: 100,
    rotation: 0,
    opacity: 1,
    blend: 'source-over',
    visible: true,
    locked: false,
    fillOn: true,
    fill: '#0e9c8133',
    stroke: '#0e9c81',
    strokeWidth: 3,
    ...overrides,
  };
}

function pointerEvent({ type = 'pointerdown', x, y, button = 0, shiftKey = false, pointerId = 1 } = {}) {
  return {
    type,
    clientX: x,
    clientY: y,
    button,
    shiftKey,
    pointerId,
  };
}

function setup(tool = 'select', objects = [makeShape()]) {
  setState({ activeTool: tool });
  const mgr = new ObjectManager(fakeCanvas(), vi.fn(), cm);
  mgr.objects = objects;
  return mgr;
}

describe('object interaction — selection and move', () => {
  beforeEach(() => {
    setState({ activeTool: 'select' });
    document.body.innerHTML = '<select id="shape-type"><option value="rect">Rect</option></select><input id="drawing-color"><input id="brush-size" value="8"><input id="brush-opacity" value="100"><input id="eraser-size" value="8"><input id="eraser-opacity" value="100">';
  });

  it('clicking an object selects it and arms a move', () => {
    const mgr = setup();
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));

    expect(mgr.selectedId).toBe('shape-1');
    expect(mgr.mode).toBe('move');
    expect(mgr.drag).toMatchObject({ id: 'shape-1', startX: 100, startY: 100 });
  });

  it('dragging moves the object by the pointer delta', () => {
    const mgr = setup();
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 180, y: 130 }));

    const o = mgr.objects[0];
    expect(o.x).toBe(130);
    expect(o.y).toBe(80);

    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    expect(mgr.mode).toBe(null);
    expect(mgr.drag).toBe(null);
  });

  it('clicking empty space clears the selection', () => {
    const mgr = setup();
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));
    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    mgr.interaction.onPointerDown(pointerEvent({ x: 700, y: 700 }));

    expect(mgr.selectedId).toBe(null);
    expect(mgr.drag).toBe(null);
  });

  it('a right-click is ignored', () => {
    const mgr = setup();
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150, button: 2 }));
    expect(mgr.selectedId).toBe(null);
  });

  it('the move keeps the object selected through the gesture', () => {
    const mgr = setup();
    const seen = [];
    mgr.onSelectionChange = (id) => seen.push(id);
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 160, y: 150 }));
    // Selection fired once at pointerdown; the drag itself only reports the
    // still-selected id on move, so the panel never re-selects mid-gesture.
    expect(seen[0]).toBe('shape-1');
  });
});

describe('object interaction — resize', () => {
  beforeEach(() => {
    setState({ activeTool: 'select' });
    document.body.innerHTML = '<input id="drawing-color"><input id="brush-size" value="8"><input id="brush-opacity" value="100">';
  });

  it('grabbing the east handle resizes width while the west edge holds', () => {
    const mgr = setup();
    mgr.select('shape-1');
    // East handle of a 100x100 box at (100,100): (200, 150).
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 150 }));
    expect(mgr.mode).toBe('resize');
    // The east handle's anchor is the west edge. `-handle.sy` on a zero can
    // produce -0, which ===/== accept but vitest's deep-equal distinguishes,
    // so compare componentwise with equality.
    expect(mgr.drag.anchor.sx).toBe(-1);
    expect(mgr.drag.anchor.sy === 0).toBe(true);

    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 250, y: 150 }));
    const o = mgr.objects[0];
    expect(o.w).toBe(150);
    expect(o.x).toBe(100); // anchor held

    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    expect(mgr.mode).toBe(null);
  });

  it('a cancelled resize restores nothing but clears the gesture', () => {
    const mgr = setup();
    mgr.select('shape-1');
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 150 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 250, y: 150 }));
    mgr.interaction.onPointerCancel(pointerEvent({ type: 'pointercancel' }));
    // Cancel ends the drag; the size the user dragged to stays, because a
    // cancelled gesture was a valid resize until it was interrupted — only
    // the in-flight brush is dropped on cancel.
    expect(mgr.mode).toBe(null);
    expect(mgr.drag).toBe(null);
    expect(mgr.objects[0].w).toBe(150);
  });
});

describe('object interaction — rotate', () => {
  beforeEach(() => {
    setState({ activeTool: 'select' });
    document.body.innerHTML = '';
  });

  it('grabbing the rotate handle enters rotate mode', () => {
    const mgr = setup();
    mgr.select('shape-1');
    // rotateHandle of an unrotated 100x100 box: (150, 100 - 24) = (150, 76).
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 76 }));
    expect(mgr.mode).toBe('rotate');
    expect(mgr.drag.anchor).toBe(null);
  });

  it('dragging sets rotation, shift snaps to 15 degrees', () => {
    const mgr = setup();
    mgr.select('shape-1');
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 76 }));
    // Move to the left of centre at the same height: angle -90+90=0 -> +... ;
    // just check the readout appeared and the value is a multiple of 15 with shift.
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 76, y: 150, shiftKey: true }));
    expect(mgr.objects[0].rotation % 15).toBe(0);
    expect(mgr.angleReadout).toMatch(/°$/);
  });
});

describe('object interaction — tool paths', () => {
  beforeEach(() => {
    document.body.innerHTML = '<select id="shape-type"><option value="rect">Rect</option></select><input id="drawing-color" value="#0e9c81"><input id="brush-size" value="8"><input id="brush-opacity" value="100"><input id="eraser-size" value="8"><input id="eraser-opacity" value="100">';
  });

  it('brush mode starts a stroke in draw mode', () => {
    const mgr = setup('brush', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 200 }));
    expect(mgr.mode).toBe('draw');
    expect(mgr.drawing).not.toBe(null);
    expect(mgr.drawing.points).toHaveLength(1);
  });

  it('a cancelled brush drops the stroke entirely', () => {
    // Regression pinned by the pointercancel comment: an interrupted
    // gesture must not commit a fragment layer.
    const mgr = setup('brush', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 200 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 220, y: 200 }));
    mgr.interaction.onPointerCancel(pointerEvent({ type: 'pointercancel' }));
    expect(mgr.drawing).toBe(null);
    expect(mgr.objects).toHaveLength(0);
  });

  it('an ended brush commits a layer', () => {
    const mgr = setup('brush', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 200 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 300, y: 250 }));
    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    expect(mgr.drawing).toBe(null);
    expect(mgr.objects).toHaveLength(1);
    expect(mgr.objects[0].type).toBe('brush');
    expect(mgr.selectedId).toBe(mgr.objects[0].id);
  });

  it('a two-point drag with less than the sampling threshold still yields a minimal stroke', () => {
    // A single-pixel brush tap should commit a point-sized stroke, not throw.
    const mgr = setup('brush', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 200 }));
    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    expect(mgr.objects).toHaveLength(1);
  });

  it('shape mode rubber-bands and commits on pointerup', () => {
    const mgr = setup('shape', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 100, y: 100 }));
    expect(mgr.mode).toBe('shape-draw');
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 200, y: 180 }));
    expect(mgr.shapeCurrent).toEqual({ x: 200, y: 180 });
    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    expect(mgr.objects).toHaveLength(1);
    expect(mgr.objects[0].shape).toBe('rect');
    expect(mgr.objects[0].x).toBe(100);
    expect(mgr.objects[0].w).toBe(100);
  });

  it('the eraser stores a supported blend and an erasing flag', () => {
    const mgr = setup('eraser', []);
    mgr.interaction.onPointerDown(pointerEvent({ x: 200, y: 200 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 260, y: 240 }));
    mgr.interaction.onPointerEnd(pointerEvent({ type: 'pointerup' }));
    const stroke = mgr.objects[0];
    expect(stroke.blend).toBe('source-over'); // destination-out would 400
    expect(stroke.erasing).toBe(true);
  });

  it('pick mode routes the point to onPick and never selects', () => {
    const mgr = setup('select');
    mgr.pickMode = true;
    const onPick = vi.fn();
    mgr.onPick = onPick;
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));
    expect(onPick).toHaveBeenCalledWith({ x: 150, y: 150 });
    expect(mgr.selectedId).toBe(null);
  });

  it('move tool also drags objects', () => {
    const mgr = setup('move');
    mgr.interaction.onPointerDown(pointerEvent({ x: 150, y: 150 }));
    mgr.interaction.onPointerMove(pointerEvent({ type: 'pointermove', x: 170, y: 150 }));
    expect(mgr.objects[0].x).toBe(120);
  });

  it('double-clicking a text object opens the editor popover', () => {
    const text = makeShape({ id: 'txt-1', type: 'text', text: 'hi', fontSize: 24 });
    const mgr = setup('select', [text]);
    mgr.editText = vi.fn();
    mgr.interaction.onDoubleClick(pointerEvent({ type: 'dblclick', x: 150, y: 150 }));
    expect(mgr.editText).toHaveBeenCalledWith('txt-1');
  });
});

describe('object interaction — cursors', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="drawing-color" value="#0e9c81"><input id="brush-size" value="8"><input id="brush-opacity" value="100"><input id="eraser-size" value="8"><input id="eraser-opacity" value="100">';
  });

  it('paint tools show a crosshair', () => {
    const mgr = setup('brush', []);
    mgr.interaction.updateCursor({ x: 100, y: 100 });
    expect(mgr.canvas.style.cursor).toBe('crosshair');
  });

  it('a handle over the selection shows its resize cursor', () => {
    const mgr = setup();
    mgr.select('shape-1');
    mgr.interaction.updateCursor({ x: 200, y: 150 }); // east handle
    expect(mgr.canvas.style.cursor).toBe('ew-resize');
  });

  it('the object body shows move, empty canvas shows default', () => {
    const mgr = setup();
    mgr.interaction.updateCursor({ x: 150, y: 150 });
    expect(mgr.canvas.style.cursor).toBe('move');
    mgr.interaction.updateCursor({ x: 700, y: 700 });
    expect(mgr.canvas.style.cursor).toBe('default');
  });
});
