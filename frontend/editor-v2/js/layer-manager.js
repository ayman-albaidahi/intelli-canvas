import { TYPE_GLYPH, TYPE_LABEL, BLEND_MODES } from './object-manager.js';
import { escapeHtml } from './escape-html.js';

export class LayerManager {
  constructor(objectManager, { list, empty, count, showToast }) {
    this.objects = objectManager;
    this.list = list;
    this.empty = empty;
    this.count = count;
    this.showToast = showToast;
    this.dragId = null;
    this.menu = document.querySelector('#layer-menu');
    this.props = {
      box: document.querySelector('#object-properties'),
      empty: document.querySelector('#object-empty'),
      name: document.querySelector('#obj-name'),
      type: document.querySelector('#obj-type'),
      x: document.querySelector('#obj-x'),
      y: document.querySelector('#obj-y'),
      w: document.querySelector('#obj-w'),
      h: document.querySelector('#obj-h'),
      rotation: document.querySelector('#obj-rotation'),
      opacity: document.querySelector('#obj-opacity'),
      opacityVal: document.querySelector('#obj-opacity-val'),
      blend: document.querySelector('#obj-blend'),
    };
    this.props.blend.innerHTML = BLEND_MODES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    objectManager.onChange = () => this.refresh();
    objectManager.onSelectionChange = (id) => { this.syncSelection(id); this.updateInspector(); };
    this.bindInspector();
    this.bindMenu();
    this.refresh();
  }

  /* ---------- panel ---------- */

  refresh() {
    const objects = this.objects.objects;
    this.count.textContent = String(objects.length);
    this.empty.hidden = objects.length > 0;
    this.list.innerHTML = '';
    [...objects].reverse().forEach((object) => this.list.appendChild(this.buildRow(object)));
    this.syncSelection(this.objects.selectedId);
  }

  buildRow(object) {
    const row = document.createElement('div');
    row.className = 'layer-row' + (object.id === this.objects.selectedId ? ' is-selected' : '');
    row.dataset.id = object.id;
    row.draggable = true;
    row.innerHTML = `
      <button class="layer-vis" title="Show / hide">${object.visible ? '👁' : '🚫'}</button>
      <span class="layer-thumb" title="${TYPE_LABEL[object.type]}">${TYPE_GLYPH[object.type]}</span>
      <span class="layer-name" title="Double-click to rename">${escapeHtml(object.name)}</span>
      <span class="layer-type">${TYPE_LABEL[object.type]}${object.locked ? ' · 🔒' : ''}</span>
      <button class="layer-lock" title="Lock / unlock">${object.locked ? '🔒' : '🔓'}</button>
      <button class="layer-more" title="More actions" aria-haspopup="true" aria-expanded="false">⋯</button>`;
    row.addEventListener('click', (event) => {
      if (event.target.closest('.layer-vis')) { this.objects.toggleVisibility(object.id); return; }
      if (event.target.closest('.layer-lock')) { this.objects.toggleLock(object.id); return; }
      if (event.target.closest('.layer-more')) { this.openMenu(object.id, event.target.closest('.layer-more')); return; }
      if (event.target.closest('.layer-name')) return;
      this.objects.select(object.id);
    });
    row.querySelector('.layer-name').addEventListener('dblclick', () => this.startRename(row, object.id));
    row.addEventListener('dragstart', (event) => { this.dragId = object.id; event.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragover', (event) => { event.preventDefault(); row.classList.add('is-drop-before'); });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-before'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('is-drop-before');
      if (this.dragId && this.dragId !== object.id) this.objects.reorder(this.dragId, object.id, true);
      this.dragId = null;
    });
    row.addEventListener('dragend', () => { this.dragId = null; row.classList.remove('is-drop-before'); });
    return row;
  }

  startRename(row, id) {
    const object = this.objects.getObject(id);
    const nameSpan = row.querySelector('.layer-name');
    const input = document.createElement('input');
    input.className = 'layer-rename';
    input.value = object.name;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => { this.objects.rename(id, input.value); this.refresh(); };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') this.refresh();
    });
    input.addEventListener('blur', commit);
  }

  syncSelection(id) {
    this.list.querySelectorAll('.layer-row').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.id === id);
    });
  }

  /* ---------- actions menu ---------- */

  openMenu(id, anchor) {
    this.menu.innerHTML = `
      <button data-menu="duplicate">Duplicate</button>
      <button data-menu="rename">Rename</button>
      <button data-menu="front">Bring to front</button>
      <button data-menu="back">Send to back</button>
      <button data-menu="delete" class="danger">Delete</button>`;
    this.menu.hidden = false;
    this.menu.setAttribute('role', 'menu');
    anchor.setAttribute('aria-expanded', 'true');
    const rect = anchor.getBoundingClientRect();
    this.menu.style.top = `${Math.min(rect.bottom + 4, innerHeight - this.menu.offsetHeight - 8)}px`;
    this.menu.style.left = `${Math.max(8, rect.right - this.menu.offsetWidth)}px`;
    this.menu.dataset.id = id;
  }

  closeMenu() {
    this.menu.hidden = true;
    const trigger = document.querySelector('.layer-row.is-selected .layer-more');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  bindMenu() {
    document.addEventListener('click', (event) => {
      if (!this.menu.hidden && !event.target.closest('#layer-menu') && !event.target.closest('.layer-more')) this.closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      // Escape dismisses the menu and returns focus to its trigger; without it
      // a keyboard user has to click elsewhere to get rid of it.
      if (event.key === 'Escape' && !this.menu.hidden) {
        this.closeMenu();
        document.activeElement.blur();
      }
    });
    this.menu.addEventListener('keydown', (event) => {
      // Arrow keys move through the menu items.
      const items = Array.from(this.menu.querySelectorAll('[data-menu]'));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
    this.menu.addEventListener('click', (event) => {
      const action = event.target.dataset.menu;
      if (!action) return;
      const id = this.menu.dataset.id;
      this.closeMenu();
      if (action === 'duplicate') this.objects.duplicate(id);
      if (action === 'rename') { const row = this.list.querySelector(`[data-id="${id}"]`); if (row) this.startRename(row, id); }
      if (action === 'front') { this.objects.bringToFront(id); this.showToast('Brought to front'); }
      if (action === 'back') { this.objects.sendToBack(id); this.showToast('Sent to back'); }
      if (action === 'delete') { this.objects.select(id); this.objects.deleteSelected(); }
    });
  }

  /* ---------- inspector ---------- */

  bindInspector() {
    const numberField = (selector, apply) => {
      const input = document.querySelector(selector);
      input.addEventListener('change', () => {
        const selected = this.objects.selected;
        if (!selected) return;
        apply(selected, Number(input.value));
        this.objects.changed();
      });
    };
    numberField('#obj-x', (o, v) => { o.x = v; });
    numberField('#obj-y', (o, v) => { o.y = v; });
    numberField('#obj-w', (o, v) => { o.w = Math.max(8, v); });
    numberField('#obj-h', (o, v) => { o.h = Math.max(8, v); });
    numberField('#obj-rotation', (o, v) => { o.rotation = ((v % 360) + 360) % 360; });
    document.querySelector('#obj-opacity').addEventListener('input', (event) => {
      const selected = this.objects.selected;
      if (!selected) return;
      selected.opacity = Number(event.target.value) / 100;
      document.querySelector('#obj-opacity-val').textContent = `${event.target.value}%`;
      this.objects.render();
    });
    document.querySelector('#obj-blend').addEventListener('change', (event) => {
      const selected = this.objects.selected;
      if (!selected) return;
      selected.blend = event.target.value;
      this.objects.changed();
    });
    document.querySelector('#obj-name').addEventListener('change', (event) => {
      const selected = this.objects.selected;
      if (!selected) return;
      this.objects.rename(selected.id, event.target.value);
    });
    document.querySelector('#obj-duplicate')?.addEventListener('click', () => {
      const selected = this.objects.selected;
      if (selected) this.objects.duplicate(selected.id);
    });
    document.querySelector('#obj-delete')?.addEventListener('click', () => this.objects.deleteSelected());
  }

  updateInspector() {
    const selected = this.objects.selected;
    const { box, empty, name, type, x, y, w, h, rotation, opacity, opacityVal, blend } = this.props;
    box.hidden = !selected;
    empty.hidden = Boolean(selected);
    if (!selected) return;
    name.value = selected.name;
    type.textContent = TYPE_LABEL[selected.type];
    x.value = Math.round(selected.x);
    y.value = Math.round(selected.y);
    w.value = Math.round(selected.w);
    h.value = Math.round(selected.h);
    rotation.value = Math.round(selected.rotation);
    opacity.value = Math.round(selected.opacity * 100);
    opacityVal.textContent = `${Math.round(selected.opacity * 100)}%`;
    blend.value = selected.blend || 'source-over';
    const locked = selected.locked;
    [x, y, w, h, rotation, opacity, blend, name].forEach((input) => { input.disabled = locked; });
  }
}
