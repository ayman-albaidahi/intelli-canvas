import { describe, expect, it, vi } from 'vitest';
import { ObjectManager } from './object-manager.js';
import { setState } from './app-state.js';

// jsdom does not implement the canvas API, so a real <canvas> yields no
// context. ObjectManager only needs a bounding rect, a parent, a no-op
// context and the listener surface — a stand-in object supplies all of them
// and keeps the geometry under test independent of DOM rendering.
const NOOP_CTX = new Proxy({}, { get: () => () => {} });

function fakeCanvas({ width = 800, height = 600 } = {}) {
  return {
    width, height,
    style: {},
    parentElement: { getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) },
    getContext: () => NOOP_CTX,
    setPointerCapture: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function makeCanvasManager({ width = 800, height = 600, scale = 1, rotation = 0, flipX = 1, flipY = 1, offset = null } = {}) {
  return {
    image: {},
    documentSize: { width, height },
    scale, rotation, flipX, flipY,
    offset: offset || { x: width / 2, y: height / 2 },
    hasImage: () => true,
  };
}

function makeManager(cm) {
  return new ObjectManager(fakeCanvas(), vi.fn(), cm);
}

// The brush must convert pointer positions to image coordinates with the same
// convention canvas-manager.sampleImagePixel() uses: the image origin is the
// document centre, not the top-left corner. Before the fix, _screenToImage
// omitted the half-document offset, so a stroke aimed at the cursor landed a
// full half-document away. These tests pin the round-trip and the cases that
// used to break: zoom, pan, and differing CSS vs canvas backing size.
describe('brush coordinate alignment', () => {
  it('maps the stage centre to the document centre', () => {
    const mgr = makeManager(makeCanvasManager({ width: 32, height: 32 }));
    expect(mgr._screenToImage(16, 16)).toEqual({ x: 16, y: 16 });
  });

  it('is the exact inverse of _imageToScreen', () => {
    const cm = makeCanvasManager({ width: 400, height: 300, scale: 1.75, rotation: 12, offset: { x: 510, y: 240 } });
    const mgr = makeManager(cm);
    const samples = [[0, 0], [200, 150], [-37.5, 88], [430, -9]];
    for (const [ix, iy] of samples) {
      const s = mgr._imageToScreen(ix, iy);
      const back = mgr._screenToImage(s.x, s.y);
      expect(back.x).toBeCloseTo(ix, 6);
      expect(back.y).toBeCloseTo(iy, 6);
    }
  });

  it('keeps alignment under zoom', () => {
    const p = { x: 137, y: 91 };
    const mgr1 = makeManager(makeCanvasManager({ width: 200, height: 200 }));
    const mgr2 = makeManager(makeCanvasManager({ width: 200, height: 200, scale: 2.5, offset: { x: 400, y: 300 } }));
    // The same image point projects to a different screen spot, but recovering
    // it from either yields the identical image point — that is what "alignment
    // holds under zoom" means for a stored stroke.
    const s1 = mgr1._imageToScreen(p.x, p.y);
    const s2 = mgr2._imageToScreen(p.x, p.y);
    expect(s1).not.toEqual(s2);
    expect(mgr1._screenToImage(s1.x, s1.y)).toEqual(p);
    expect(mgr2._screenToImage(s2.x, s2.y)).toEqual(p);
  });

  it('keeps alignment after panning', () => {
    const p = { x: 150, y: 120 };
    const mgr = makeManager(makeCanvasManager({ width: 200, height: 200 }));
    const panned = makeManager(makeCanvasManager({ width: 200, height: 200, offset: { x: 640, y: 415 } }));
    const s = mgr._imageToScreen(p.x, p.y);
    const sPan = panned._imageToScreen(p.x, p.y);
    expect(s).not.toEqual(sPan); // the view moved
    expect(panned._screenToImage(sPan.x, sPan.y)).toEqual(p); // the image point did not
  });

  it('is independent of CSS vs backing-store size', () => {
    // The conversion consumes only canvas-manager state and never multiplies by
    // devicePixelRatio, so a backing store twice the CSS size with the same
    // logical geometry must yield the same image point. The canvas stand-in's
    // own width/height is never read by the math.
    const cm = makeCanvasManager({ width: 100, height: 100, offset: { x: 415, y: 290 } });
    const mgr = makeManager(cm);
    const narrow = new ObjectManager(fakeCanvas({ width: 200, height: 150 }), vi.fn(), cm);
    expect(mgr._screenToImage(415, 290)).toEqual(narrow._screenToImage(415, 290));
    // 415 - 415 = 0 offset from centre, so the point is the document centre.
    expect(mgr._screenToImage(415, 290)).toEqual({ x: 50, y: 50 });
  });
});

describe('eraser layer hygiene', () => {
  it('uses the active Brush controls for a painted stroke', () => {
    const mgr = makeManager(makeCanvasManager());
    setState({ activeTool: 'brush', editorReady: true, hasImage: true, selectedObjectId: null });
    document.body.innerHTML = '<input id="brush-size" value="24"><input id="brush-opacity" value="65"><input id="drawing-color" value="#123456">';
    mgr.startBrush({ x: 400, y: 300 });
    expect(mgr.drawing.strokeWidth).toBe(24);
    expect(mgr.drawing.opacity).toBeCloseTo(0.65);
    expect(mgr.drawing.color).toBe('#123456');
    expect(mgr.drawing.erasing).toBe(false);
  });

  it('uses independent Eraser controls and keeps eraser settings out of Brush controls', () => {
    const mgr = makeManager(makeCanvasManager());
    document.body.innerHTML = '<input id="brush-size" value="24"><input id="brush-opacity" value="65"><input id="drawing-color" value="#123456"><input id="eraser-size" value="42"><input id="eraser-opacity" value="35">';
    setState({ editorReady: true, hasImage: true, activeTool: 'eraser', selectedObjectId: null });
    mgr.startBrush({ x: 400, y: 300 });
    expect(mgr.drawing.strokeWidth).toBe(42);
    expect(mgr.drawing.opacity).toBeCloseTo(0.35);
    expect(mgr.drawing.erasing).toBe(true);
    setState({ activeTool: 'brush' });
  });

  it('never stores destination-out as the blend mode', () => {
    const mgr = makeManager(makeCanvasManager());
    document.body.innerHTML = '<input id="brush-size" value="8"><input id="drawing-color" value="#d95687">';
    mgr.startBrush({ x: 400, y: 300 });
    expect(mgr.drawing.blend).toBe('source-over');
  });

  it('flags erasing strokes while keeping a supported stored blend', () => {
    const mgr = makeManager(makeCanvasManager());
    document.body.innerHTML = '<input id="brush-size" value="8"><input id="drawing-color" value="#d95687">';
    mgr.startBrush({ x: 400, y: 300 });
    mgr.drawing.erasing = true;
    mgr.drawing.points.push([410, 310]);
    mgr.endBrush();
    const stored = mgr.serializeLayers().find((l) => l.type === 'brush');
    expect(stored.blend).toBe('source-over');
    expect(stored.erasing).toBe(true);
  });

  it('survives a save/restore round-trip without re-converting stored points', () => {
    const mgr = makeManager(makeCanvasManager({ width: 100, height: 100 }));
    document.body.innerHTML = '<input id="brush-size" value="8"><input id="drawing-color" value="#d95687">';
    mgr.startBrush({ x: 400, y: 300 });
    mgr.drawing.points.push([420, 320]);
    mgr.endBrush();
    const before = mgr.serializeLayers().find((l) => l.type === 'brush');
    // loadLayers must treat stored points as already in image coordinates;
    // converting them again shifted every saved stroke on reload.
    return mgr.loadLayers([{ ...before }]).then(() => {
      const after = mgr.objects.find((l) => l.type === 'brush');
      expect(after.points[0]).toEqual(before.points[0]);
      expect(after.points[1]).toEqual(before.points[1]);
    });
  });

  it('renders a stored brush in screen space without a second center translation', () => {
    const transforms = [];
    const ctx = new Proxy({}, {
      get: (_target, property) => {
        if (property === 'translate') return (...args) => transforms.push(args);
        return () => {};
      },
      set: () => true,
    });
    const cm = makeCanvasManager({ width: 100, height: 100, offset: { x: 300, y: 200 } });
    const mgr = makeManager(cm);
    mgr.ctx = ctx;
    mgr.objects = [{
      id: 'brush-1', type: 'brush', x: 10, y: 10, w: 20, h: 20,
      pointsRel: [[-10, -10], [10, 10]], strokeWidth: 8,
      color: '#d95687', opacity: 1, rotation: 0, blend: 'source-over', visible: true,
    }];

    mgr.drawObject(mgr.objects[0]);

    // The brush renderer owns the image-to-screen translation. drawObject must
    // not add the object's local center translation before calling it.
    expect(transforms).toEqual([[270, 170]]);
  });

  it('uses destination-out when exporting an erasing brush', () => {
    let composite = null;
    const ctx = new Proxy({}, {
      get: (_target, property) => {
        if (property === 'globalCompositeOperation') return composite;
        return () => {};
      },
      set: (_target, property, value) => {
        if (property === 'globalCompositeOperation') composite = value;
        return true;
      },
    });
    const mgr = makeManager(makeCanvasManager({ width: 100, height: 100 }));
    mgr.objects = [{
      id: 'eraser-1', type: 'brush', x: 40, y: 40, w: 20, h: 20,
      pointsRel: [[-10, -10], [10, 10]], strokeWidth: 8,
      color: '#d95687', opacity: 1, rotation: 0,
      blend: 'source-over', erasing: true, visible: true,
    }];

    mgr.renderExport(ctx, { x: 0, y: 0, width: 100, height: 100 }, 100, 100);

    expect(composite).toBe('destination-out');
  });
});
