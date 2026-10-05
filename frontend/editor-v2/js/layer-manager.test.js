import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { LayerManager } from './layer-manager.js';

// LayerManager renders against the real layer panel markup, so the fixture
// mirrors it: the row list plus every #obj-* inspector input (bindInspector
// binds them unguarded — they must exist) and #layer-menu. The object
// manager is a fake exposing exactly the surface this class calls: the
// list, the selection, and the mutators. That keeps the test about the
// panel's behaviour — ordering, escaping, delegation, the menu state
// machine, and the inspector sync — not about ObjectManager's internals.

function fixture() {
  document.body.innerHTML = `
    <div id="layers-list"></div>
    <div id="layers-empty" hidden></div>
    <span id="layer-count">0</span>
    <div id="layer-menu" hidden></div>
    <div id="object-properties" hidden>
      <span id="obj-type"></span>
      <input id="obj-name" type="text">
      <input id="obj-x" type="number"><input id="obj-y" type="number">
      <input id="obj-w" type="number"><input id="obj-h" type="number">
      <input id="obj-rotation" type="number">
      <label>Opacity · <span id="obj-opacity-val">100%</span>
      <input id="obj-opacity" type="range" min="0" max="100" value="100"></label>
      <select id="obj-blend"></select>
      <button id="obj-duplicate">Duplicate</button>
      <button id="obj-delete">Delete</button>
    </div>
    <div id="object-empty"></div>
    <button class="more-button">•••</button>
  `;
}

function makeObjects(list = [], selectedId = null) {
  const objects = {
    objects: list,
    selectedId,
    onChange: null,
    onSelectionChange: null,
    toggleVisibility: vi.fn(),
    toggleLock: vi.fn(),
    reorder: vi.fn(),
    duplicate: vi.fn(),
    rename: vi.fn((id, name) => { const o = list.find((x) => x.id === id); if (o) o.name = name; }),
    bringToFront: vi.fn(),
    sendToBack: vi.fn(),
    deleteSelected: vi.fn(),
    changed: vi.fn(),
    render: vi.fn(),
    getObject: (id) => list.find((o) => o.id === id) || null,
  };
  objects.select = vi.fn((id) => {
    objects.selectedId = id;
  });
  Object.defineProperty(objects, 'selected', {
    get: () => objects.objects.find((o) => o.id === objects.selectedId) || null,
  });
  return objects;
}

function layer(id, name, overrides = {}) {
  return {
    id,
    name,
    type: 'brush',
    x: 10,
    y: 20,
    w: 30,
    h: 40,
    rotation: 0,
    opacity: 1,
    blend: 'source-over',
    visible: true,
    locked: false,
    ...overrides,
  };
}

function makeManager(objects) {
  return new LayerManager(objects, {
    list: document.getElementById('layers-list'),
    empty: document.getElementById('layers-empty'),
    count: document.getElementById('layer-count'),
    showToast: makeManager.showToast,
  });
}

describe('layer manager', () => {
  let objects;

  beforeEach(() => {
    fixture();
    makeManager.showToast = vi.fn();
    objects = makeObjects([layer('a', 'Stroke A'), layer('b', 'Shape B')]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('panel render', () => {
    it('lists rows top-of-z-order first and updates the count', () => {
      makeManager(objects);
      const rows = document.querySelectorAll('.layer-row');
      expect(rows).toHaveLength(2);
      // objects are drawn last-on-top; the panel reverses them.
      expect([...rows].map((r) => r.dataset.id)).toEqual(['b', 'a']);
      expect(document.getElementById('layer-count').textContent).toBe('2');
      expect(document.getElementById('layers-empty').hidden).toBe(true);
    });

    it('shows the empty state when there are no layers', () => {
      objects = makeObjects([]);
      makeManager(objects);
      expect(document.getElementById('layers-empty').hidden).toBe(false);
      expect(document.getElementById('layer-count').textContent).toBe('0');
    });

    it('escapes layer names: markup in a name never becomes markup', () => {
      objects = makeObjects([layer('x', '<img src=x onerror=alert(1)>')]);
      makeManager(objects);
      const row = document.querySelector('.layer-row');
      expect(row.querySelector('img')).toBe(null);
      expect(row.querySelector('.layer-name').textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('marks a locked layer and its row state in the type label', () => {
      objects = makeObjects([layer('l', 'Locked', { locked: true })]);
      makeManager(objects);
      expect(document.querySelector('.layer-type').textContent).toBe('Brush · locked');
    });

    it('refresh() runs on objectManager.onChange', () => {
      const mgr = makeManager(objects);
      const spy = vi.spyOn(mgr, 'refresh');
      objects.onChange();
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('row interaction', () => {
    function rowOf(id) {
      return document.querySelector(`.layer-row[data-id="${id}"]`);
    }

    it('delegates clicks: eye toggles visibility, lock toggles, body selects', () => {
      const mgr = makeManager(objects);
      const row = rowOf('a');
      row.querySelector('.layer-vis').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(objects.toggleVisibility).toHaveBeenCalledWith('a');
      row.querySelector('.layer-lock').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(objects.toggleLock).toHaveBeenCalledWith('a');
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(objects.select).toHaveBeenCalledWith('a');
      expect(mgr).toBeInstanceOf(LayerManager);
    });

    it('double-click on the name swaps in a rename input; Enter commits, Escape re-renders', () => {
      const mgr = makeManager(objects);
      let row = document.querySelector('.layer-row[data-id="a"]');
      row.querySelector('.layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const input = row.querySelector('input.layer-rename');
      expect(input).not.toBe(null);
      expect(input.value).toBe('Stroke A');
      input.value = 'Renamed';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(objects.rename).toHaveBeenCalledWith('a', 'Renamed');
      // The commit refreshed the list: the live row is a new node and
      // carries the mock-applied name back into the span.
      row = document.querySelector('.layer-row[data-id="a"]');
      expect(row.querySelector('.layer-name').textContent).toBe('Renamed');

      // Escape re-renders without changing anything (value left as-is, so
      // the commit-on-blur that removal may fire is idempotent either way).
      row.querySelector('.layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      row = document.querySelector('.layer-row[data-id="a"]');
      const escInput = document.querySelector('input.layer-rename');
      escInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('.layer-row[data-id="a"] input.layer-rename')).toBe(null);
      expect(document.querySelector('.layer-row[data-id="a"] .layer-name').textContent).toBe('Renamed');
      expect(mgr).toBeInstanceOf(LayerManager);
    });


    it('drag-drop on another row reorders, and dropping onto itself does nothing', () => {
      const mgr = makeManager(objects);
      const source = rowOf('a');
      const target = rowOf('b');

      source.dispatchEvent(makeDragEvent('dragstart'));
      expect(mgr.dragId).toBe('a');
      target.dispatchEvent(makeDragEvent('drop'));
      expect(objects.reorder).toHaveBeenCalledWith('a', 'b', true);
      expect(mgr.dragId).toBe(null);

      objects.reorder.mockClear();
      source.dispatchEvent(makeDragEvent('dragstart'));
      source.dispatchEvent(makeDragEvent('drop'));
      expect(objects.reorder).not.toHaveBeenCalled();
    });

    function makeDragEvent(type) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      event.dataTransfer = { effectAllowed: '', setData: () => {}, getData: () => '' };
      return event;
    }

    it('syncSelection highlights only the selected row', () => {
      const mgr = makeManager(objects);
      mgr.syncSelection('a');
      expect(rowOf('a').classList.contains('is-selected')).toBe(true);
      expect(rowOf('b').classList.contains('is-selected')).toBe(false);
    });
  });

  describe('actions menu', () => {
    function openMenu(mgr, id = 'a') {
      const anchor = document.createElement('button');
      document.body.appendChild(anchor);
      mgr.openMenu(id, anchor);
      return anchor;
    }

    it('openMenu lists the five actions and hides nothing else', () => {
      const mgr = makeManager(objects);
      const anchor = openMenu(mgr);
      const menu = document.getElementById('layer-menu');
      expect(menu.hidden).toBe(false);
      expect(menu.dataset.id).toBe('a');
      expect(anchor.getAttribute('aria-expanded')).toBe('true');
      expect([...menu.querySelectorAll('[data-menu]')].map((b) => b.dataset.menu))
        .toEqual(['duplicate', 'rename', 'front', 'back', 'delete']);
    });

    it('menu actions route to the object manager', () => {
      const mgr = makeManager(objects);
      openMenu(mgr);
      const menu = document.getElementById('layer-menu');

      click('[data-menu="duplicate"]');
      expect(objects.duplicate).toHaveBeenCalledWith('a');

      openMenu(mgr, 'b');
      click('[data-menu="front"]');
      expect(objects.bringToFront).toHaveBeenCalledWith('b');
      expect(makeManager.showToast).toHaveBeenCalledWith('Brought to front');

      openMenu(mgr, 'a');
      click('[data-menu="back"]');
      expect(objects.sendToBack).toHaveBeenCalledWith('a');

      openMenu(mgr, 'a');
      click('[data-menu="delete"]');
      expect(objects.select).toHaveBeenCalledWith('a');
      expect(objects.deleteSelected).toHaveBeenCalled();

      function click(selector) {
        menu.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

    it('Escape closes the menu; an outside click does too', () => {
      const mgr = makeManager(objects);
      openMenu(mgr);
      const menu = document.getElementById('layer-menu');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(menu.hidden).toBe(true);

      openMenu(mgr);
      expect(menu.hidden).toBe(false);
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(menu.hidden).toBe(true);
    });

    it('arrow keys cycle focus through the menu items', () => {
      const mgr = makeManager(objects);
      openMenu(mgr);
      const menu = document.getElementById('layer-menu');
      const items = [...menu.querySelectorAll('[data-menu]')];

      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[1]);
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
    });
  });

  describe('inspector', () => {
    it('updateInspector fills every field from the selection and re-enables locked controls', () => {
      objects = makeObjects([layer('a', 'Stroke A', { x: 10.4, opacity: 0.4 })]);
      const mgr = makeManager(objects);
      objects.selectedId = 'a';
      mgr.updateInspector();
      expect(document.getElementById('object-properties').hidden).toBe(false);
      expect(document.getElementById('object-empty').hidden).toBe(true);
      expect(document.getElementById('obj-name').value).toBe('Stroke A');
      expect(document.getElementById('obj-type').textContent).toBe('Brush');
      expect(document.getElementById('obj-x').value).toBe('10');
      expect(document.getElementById('obj-opacity').value).toBe('40');
      expect(document.getElementById('obj-opacity-val').textContent).toBe('40%');
      expect(document.getElementById('obj-blend').value).toBe('source-over');
      expect(document.getElementById('obj-x').disabled).toBe(false);
    });

    it('a locked selection disables the geometry and style fields', () => {
      objects = makeObjects([layer('l', 'Locked', { locked: true })]);
      const mgr = makeManager(objects);
      objects.selectedId = 'l';
      mgr.updateInspector();
      expect(document.getElementById('obj-x').disabled).toBe(true);
      expect(document.getElementById('obj-name').disabled).toBe(true);
    });

    it('with nothing selected the properties box hides', () => {
      const mgr = makeManager(objects);
      mgr.updateInspector();
      expect(document.getElementById('object-properties').hidden).toBe(true);
      expect(document.getElementById('object-empty').hidden).toBe(false);
    });

    it('editing a number field applies it and flags the change', () => {
      makeManager(objects);
      objects.selectedId = 'a';
      const x = document.getElementById('obj-x');
      x.value = '55';
      x.dispatchEvent(new Event('change'));
      expect(objects.objects[0].x).toBe(55);
      expect(objects.changed).toHaveBeenCalledOnce();
    });

    it('size fields clamp to 8 and rotation normalises', () => {
      makeManager(objects);
      objects.selectedId = 'a';
      const w = document.getElementById('obj-w');
      w.value = '2';
      w.dispatchEvent(new Event('change'));
      expect(objects.objects[0].w).toBe(8);
      const rot = document.getElementById('obj-rotation');
      rot.value = '-90';
      rot.dispatchEvent(new Event('change'));
      expect(objects.objects[0].rotation).toBe(270);
    });

    it('opacity and blend write to the selection', () => {
      makeManager(objects);
      objects.selectedId = 'a';
      const op = document.getElementById('obj-opacity');
      op.value = '70';
      op.dispatchEvent(new Event('input'));
      expect(objects.objects[0].opacity).toBe(0.7);
      expect(document.getElementById('obj-opacity-val').textContent).toBe('70%');
      const blend = document.getElementById('obj-blend');
      blend.value = 'multiply';
      blend.dispatchEvent(new Event('change'));
      expect(objects.objects[0].blend).toBe('multiply');
    });

    it('number edits with no selection are dropped', () => {
      makeManager(objects);
      const x = document.getElementById('obj-x');
      x.value = '99';
      expect(() => x.dispatchEvent(new Event('change'))).not.toThrow();
      expect(objects.changed).not.toHaveBeenCalled();
    });

    it('the header more-button duplicates the selection, or asks for one', () => {
      const mgr = makeManager(objects);
      document.querySelector('.more-button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(makeManager.showToast).toHaveBeenCalledWith('Select a layer first');
      objects.selectedId = 'a';
      document.querySelector('.more-button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(objects.duplicate).toHaveBeenCalledWith('a');
      expect(mgr).toBeInstanceOf(LayerManager);
    });

    it('blend select is populated from BLEND_MODES', () => {
      makeManager(objects);
      const options = [...document.getElementById('obj-blend').options].map((o) => o.value);
      expect(options).toContain('multiply');
      expect(options).toContain('source-over');
    });
  });
});
