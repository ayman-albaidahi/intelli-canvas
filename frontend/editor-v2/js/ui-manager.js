import { appState, setState } from './app-state.js';

const toast = document.querySelector('#toast');
let toastTimer;

const inspector = document.querySelector('#inspector');
const inspectorScrim = document.querySelector('#inspector-scrim');
const inspectorToggle = document.querySelector('[data-action="inspector-toggle"]');
// jsdom has no matchMedia; the optional chain keeps the module importable in
// unit tests, where the drawer simply reports "not mobile".
const mobileQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 900px)')
    : null;
const isMobile = () => mobileQuery()?.matches ?? false;

const READY_PANELS = new Set(['adjustments', 'filters', 'background', 'smart-crop']);

const CONTEXT_LABELS = {
  canvas: ['Nothing selected', 'Select an object or choose an editing tool.'],
  image: ['Image selected', 'Edit the image with focused actions and adjustments.'],
  layer: ['Layer selected', 'Edit the selected layer without unrelated image controls.'],
  tool: ['Tool active', 'Adjust the active tool settings.'],
  crop: ['Crop active', 'Set the framing, then apply or cancel the crop.'],
};

export function getInspectorContext({ ready, activeTool = 'select', selectedObjectId = null } = {}) {
  if (!ready) return 'canvas';
  if (activeTool === 'crop') return 'crop';
  if (['brush', 'eraser', 'shape', 'text'].includes(activeTool)) return 'tool';
  if (selectedObjectId) return 'layer';
  return 'image';
}

export function renderInspectorContext({ ready = document.body.dataset.editorReady === 'true', activeTool = appState.activeTool, selectedObjectId = appState.selectedObjectId } = {}) {
  const context = getInspectorContext({ ready, activeTool, selectedObjectId });
  document.body.dataset.inspectorContext = context;
  const [title, copy] = CONTEXT_LABELS[context];
  const titleEl = document.querySelector('#edit-empty-title');
  const copyEl = document.querySelector('#edit-empty-copy');
  if (titleEl) titleEl.textContent = title;
  if (copyEl) copyEl.textContent = copy;
  document.querySelectorAll('[data-contextual-actions] [data-context]').forEach((action) => {
    action.hidden = action.dataset.context !== context && !(context === 'crop' && action.dataset.context === 'image');
  });
  return context;
}

// The pre-upload hint is appended to the control's own tooltip rather than
// replacing it. Caching the original title first means readiness can be
// toggled any number of times without the hint accumulating or the real
// label being lost once an image is loaded.
function setControlReady(control, isReady) {
  control.disabled = !isReady;
  control.classList.toggle('is-disabled', !isReady);
  control.setAttribute('aria-disabled', String(!isReady));
  if (control.dataset.originalTitle === undefined) {
    control.dataset.originalTitle = control.title || '';
  }
  control.title = isReady
    ? control.dataset.originalTitle
    : `${control.dataset.originalTitle} — Upload an image first`;
}

export function setEditorReady(ready) {
  const isReady = Boolean(ready);
  document.body.dataset.editorReady = String(isReady);
  renderInspectorContext({ ready: isReady });
  document.querySelectorAll('[data-requires-image]').forEach((control) => {
    setControlReady(control, isReady);
  });
  document.querySelectorAll('[data-inspector]').forEach((tab) => {
    const available = isReady || tab.dataset.inspector === 'edit';
    tab.disabled = !available;
    tab.classList.toggle('is-disabled', !available);
    tab.setAttribute('aria-disabled', String(!available));
  });
}

export function initUI() {
  setEditorReady(false);
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach((item) => {
        item.classList.remove('is-active');
        // aria-pressed mirrors the class so the selected tool is announced on
        // first load and after every switch, not only when it was clicked.
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
      setState({ activeTool: button.dataset.tool });
      renderInspectorContext();
      showToast(`${button.dataset.tool[0].toUpperCase()}${button.dataset.tool.slice(1)} tool selected`);
    });
  });

  const tabs = Array.from(document.querySelectorAll('[data-inspector]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchInspector(tab.dataset.inspector));
  });

  // A tablist is only operable from the keyboard if the arrows move between
  // tabs and Home/End jump to the ends. All tabs stay in the tab order here
  // rather than using roving tabindex, because the drawer pattern relies on
  // every tab being a reachable focus target on mobile.
  const tablist = document.querySelector('.inspector-tabs');
  if (tablist && tabs.length) {
    tablist.addEventListener('keydown', (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current === -1) return;
      let next = null;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      switchInspector(tabs[next].dataset.inspector);
    });
  }

  document.querySelectorAll('[data-panel]').forEach((button) => {
    const panel = button.dataset.panel;
    if (panel === 'shortcuts') {
      document.querySelector('.avatar')?.addEventListener('click', () => {
    openDialog(document.querySelector('#shortcuts-dialog'), { focus: '#shortcuts-cancel-secondary' });
  });

  document.querySelector('#shortcuts-cancel')?.addEventListener('click', () => {
    closeDialog(document.querySelector('#shortcuts-dialog'));
  });
  document.querySelector('#shortcuts-cancel-secondary')?.addEventListener('click', () => {
    closeDialog(document.querySelector('#shortcuts-dialog'));
  });

  // The keyboard help used to mark itself aria-disabled and toast on
      // click, which is a discoverability affordance that does nothing.
      button.addEventListener('click', () => {
        const dialog = document.querySelector('#shortcuts-dialog');
        openDialog(dialog, { focus: '#shortcuts-cancel-secondary' });
      });
    } else if (READY_PANELS.has(panel)) {
      button.addEventListener('click', () => focusPanel(panel));
    } else if (panel === 'history' || panel === 'insights' || panel === 'pipeline') {
      button.addEventListener('click', () => switchInspector(panel));
    } else {
      button.classList.add('is-disabled');
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Arrives in a later stage';
      button.addEventListener('click', () => showToast(`${label(panel)} arrives in a later stage`));
    }
  });

  document.querySelector('[data-action="new"]')?.addEventListener('click', () => showToast('New project workspace is ready'));
  document.querySelector('[data-action="add-layer"]')?.addEventListener('click', () => showToast('Layer creation will be enabled in the layers stage'));
  document.querySelectorAll('#edit-panel details.panel-accordion').forEach((section) => {
    section.addEventListener('toggle', () => { if (section.open) closeOtherAccordions(section); });
  });

  // Mobile drawer: the toggle, the scrim tap, and Escape all close it. The
  // drawer is desktop-only chrome, so nothing here runs above 900px.
  inspectorToggle?.addEventListener('click', () => toggleInspectorDrawer());
  inspectorScrim?.addEventListener('click', () => closeInspectorDrawer());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && inspector?.classList.contains('is-open')) {
      event.preventDefault();
      closeInspectorDrawer();
    }
  });
  // Returning to a desktop width must not leave the drawer pinned over the
  // rail, and the toggle must not report stale state.
  mobileQuery()?.addEventListener('change', (event) => {
    if (!event.matches) closeInspectorDrawer();
  });
}

export function openInspectorDrawer() {
  if (!inspector) return;
  inspector.classList.add('is-open');
  inspectorScrim?.removeAttribute('hidden');
  inspectorToggle?.setAttribute('aria-expanded', 'true');
  // Land keyboard and screen-reader users inside the drawer rather than leaving
  // focus on the button that opened it.
  const firstTab = inspector.querySelector('[data-inspector]');
  firstTab?.focus({ preventScroll: true });
}

export function closeInspectorDrawer() {
  if (!inspector) return;
  inspector.classList.remove('is-open');
  inspectorScrim?.setAttribute('hidden', '');
  inspectorToggle?.setAttribute('aria-expanded', 'false');
  // visibility:hidden makes the drawer unfocusable; move focus back out to the
  // toggle so it does not land on whatever the browser picks.
  if (inspector.contains(document.activeElement)) inspectorToggle?.focus();
}

export function toggleInspectorDrawer() {
  if (inspector?.classList.contains('is-open')) closeInspectorDrawer();
  else openInspectorDrawer();
}

function markNotReady(selector, name) {
  const button = document.querySelector(selector);
  if (!button) return;
  button.classList.add('is-disabled');
  button.setAttribute('aria-disabled', 'true');
  button.title = `${name} arrives in a later stage`;
}

function focusPanel(panel) {
  switchInspector('edit');
  const section = document.querySelector(`#${panel}-accordion`);
  if (!section) return;
  closeOtherAccordions(section);
  section.open = true;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  section.classList.remove('is-flash');
  void section.offsetWidth;
  section.classList.add('is-flash');
}

function closeOtherAccordions(activeSection) {
  document.querySelectorAll('#edit-panel details.panel-accordion').forEach((section) => {
    if (section !== activeSection) section.open = false;
  });
}


export function switchInspector(name) {
  if (document.body.dataset.editorReady !== 'true' && name !== 'edit') return;
  setState({ activeInspector: name });
  document.querySelectorAll('[data-inspector]').forEach((tab) => {
    const active = tab.dataset.inspector === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    if (active) tab.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  });
  updateInspectorTabScroller();
  document.querySelector('#edit-panel').hidden = name !== 'edit';
  document.querySelector('#layers-panel').hidden = name !== 'layers';
  const analysisPanel = document.querySelector('#insights-panel');
  if (analysisPanel) analysisPanel.hidden = name !== 'insights';
  const historyPanel = document.querySelector('#history-panel');
  if (historyPanel) historyPanel.hidden = name !== 'history';
  const pipelinePanel = document.querySelector('#pipeline-panel');
  if (pipelinePanel) pipelinePanel.hidden = name !== 'pipeline';
  // On mobile the panels live in the drawer, so switching to one must also
  // reveal it — otherwise the tap changes hidden state behind nothing.
  if (isMobile()) openInspectorDrawer();
}

// A long-running operation that disables nothing leaves the user unable to
// tell whether the click registered. This wraps the busy contract — disable
// the trigger, swap its label, say what is happening in the status bar — and
// always restores both, including on the failure path.
//
// Managers that already implement this inline (adjustments, filters,
// smart-crop, export, pipeline) keep working; this is for the operations that
// had a busy guard but no visible feedback.
export function confirmDialog({ title = 'Are you sure?', body = 'This cannot be undone.', confirmLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.querySelector('#confirm-dialog');
    if (!dialog) { resolve(false); return; }
    const heading = dialog.querySelector('#confirm-dialog-heading');
    const bodyEl = dialog.querySelector('#confirm-dialog-body');
    const accept = dialog.querySelector('#confirm-accept');
    heading.textContent = title;
    bodyEl.textContent = body;
    accept.textContent = confirmLabel;

    // The handlers are removed on every resolution so a later confirm cannot
    // fire a stale callback from an earlier one.
    const done = (result) => {
      accept.removeEventListener('click', onAccept);
      document.querySelector('#confirm-cancel')?.removeEventListener('click', onCancel);
      document.querySelector('#confirm-cancel-secondary')?.removeEventListener('click', onCancel);
      closeDialog(dialog);
      resolve(result);
    };
    const onAccept = () => done(true);
    const onCancel = () => done(false);

    accept.addEventListener('click', onAccept);
    document.querySelector('#confirm-cancel')?.addEventListener('click', onCancel);
    document.querySelector('#confirm-cancel-secondary')?.addEventListener('click', onCancel);
    openDialog(dialog, { focus: '#confirm-accept' });
  });
}

export async function withBusy(button, message, fn, options = {}) {
  const { label = null, status = null } = options;
  if (!button) return fn();
  const original = label ?? button.textContent;
  const busyLabel = message;
  button.disabled = true;
  button.classList.add('is-busy');
  button.textContent = busyLabel;
  if (status) status.textContent = `${message}…`;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.textContent = original;
  }
}

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

// A dialog is only a dialog if the rest of the page cannot take focus while it
// is open. Each dialog records the element that opened it so focus lands back
// there on close — otherwise it falls on the body, which screen readers report
// as landing nowhere.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function dialogAncestors(dialog) {
  // Everything outside the dialog is made inert, so the background cannot be
  // tabbed into or clicked through to while it is open.
  return Array.from(document.body.children).filter((node) => !node.contains(dialog));
}

export function openDialog(dialog, options = {}) {
  if (!dialog || !dialog.hidden) return;
  const { focus = null } = options;
  dialog._lastFocused = document.activeElement;
  dialog.hidden = false;
  dialog.classList.add('is-open');
  const heading = dialog.querySelector('h2');
  if (heading && !dialog.getAttribute('aria-labelledby')) {
    if (!heading.id) heading.id = `dialog-label-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  // Inert is a set-once property per element, but setting it again on a node
  // that is still inert is harmless.
  dialogAncestors(dialog).forEach((node) => { node.inert = true; });
  (dialog.querySelector(focus) || dialog.querySelector(FOCUSABLE))?.focus();
}

export function closeDialog(dialog) {
  if (!dialog || dialog.hidden) return;
  dialog.hidden = true;
  dialog.classList.remove('is-open');
  dialogAncestors(dialog).forEach((node) => { node.inert = false; });
  // Returning focus to the opener keeps keyboard users on the control they
  // came from instead of stranding them at the top of the page.
  const restore = dialog._lastFocused;
  if (restore && document.contains(restore)) restore.focus();
}

// The one Escape handler for every dialog. A dialog that is open always wins
// over the mobile drawer and the layer menu because it is the most restrictive
// state on the page.
export function initDialogEscape() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.dialog-backdrop.is-open');
    if (!open) return;
    event.preventDefault();
    closeDialog(open);
  });
}

// A focus trap keeps Tab circulating inside the dialog. Without it, Tab at the
// last control jumps out to the (now inert) background anyway, but the
// sequence is unpredictable and Screen Reader users lose their place.
export function initDialogFocusTrap() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector('.dialog-backdrop.is-open');
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function initInspectorTabScroller(tabs) {
  const strip = document.querySelector('.inspector-tabs');
  if (!strip) return;
  document.querySelectorAll('[data-tab-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const amount = Math.max(strip.clientWidth * 0.75, 140) * (button.dataset.tabScroll === 'prev' ? -1 : 1);
      strip.scrollBy({ left: amount, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });
  strip.addEventListener('scroll', updateInspectorTabScroller, { passive: true });
  window.addEventListener('resize', updateInspectorTabScroller);
  updateInspectorTabScroller();
  tabs.forEach((tab) => tab.setAttribute('tabindex', tab.dataset.inspector === 'properties' ? '0' : '-1'));
}

function updateInspectorTabScroller() {
  const strip = document.querySelector('.inspector-tabs');
  if (!strip) return;
  const overflow = strip.scrollWidth > strip.clientWidth + 1;
  const atStart = strip.scrollLeft <= 1;
  const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  const prev = document.querySelector('[data-tab-scroll="prev"]');
  const next = document.querySelector('[data-tab-scroll="next"]');
  if (prev) { prev.hidden = !overflow; prev.disabled = atStart; }
  if (next) { next.hidden = !overflow; next.disabled = atEnd; }
  strip.dataset.overflow = String(overflow);
  strip.dataset.atStart = String(atStart);
  strip.dataset.atEnd = String(atEnd);
}

function label(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
