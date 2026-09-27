import { appState, setState } from './app-state.js';
import { deriveInspectorContext } from './inspector-context.js';
import { mountInspectorContextContainers, renderInspectorContextContainers, renderTransientContext } from './inspector-context-view.js';
import { beginOperation, completeOperation, dismissError, failOperation, retryOperation } from './operation-state.js';
import { openDialog, closeDialog } from './lib/dialogs.js';
import { bus, events } from './lib/events.js';

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

// Panels whose managers are mounted on first open rather than at boot (see
// main.js). The activator fires whenever the panel becomes visible, however
// the user got there — tab click, arrow key, or quick action. It is
// fire-and-forget: a panel that fails to load surfaces its own error and
// must never block the inspector switch.
const panelActivators = new Map();

export function onPanelOpened(panel, activate) {
  panelActivators.set(panel, activate);
}

function activatePanel(panel) {
  const activate = panelActivators.get(panel);
  if (!activate) return;
  panelActivators.delete(panel); // one-shot: the mount runs exactly once
  try {
    const result = activate();
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        // A failed dynamic import must not strand the empty panel with no
        // explanation; the toast is the editor's standard error surface.
        showToast(`Could not load the ${panel} panel: ${error.message}`);
      });
    }
  } catch (error) {
    showToast(`Could not load the ${panel} panel: ${error.message}`);
  }
}

export function getInspectorContext({ ready, activeTool = 'select', selectedObjectId = null } = {}) {
  return deriveInspectorContext({ editorReady: ready, activeTool, selectedObjectId });
}

export function renderInspectorContext(state = appState) {
  const context = deriveInspectorContext(state);
  document.body.dataset.inspectorContext = context;
  document.body.dataset.processing = String(Boolean(state.processing?.active));
  document.body.dataset.error = String(Boolean(state.error));
  renderInspectorContextContainers(context);
  renderTransientContext(state);
  updateTransientControls(state);
  document.querySelectorAll('[data-contextual-actions] [data-context]').forEach((action) => {
    action.hidden = action.dataset.context !== context && !(context === 'crop' && action.dataset.context === 'image');
  });
  return context;
}

function updateTransientControls(state) {
  const busy = Boolean(state.processing?.active);
  document.querySelectorAll('[data-tool], [data-action]').forEach((control) => {
    if (control.id === 'error-retry' || control.id === 'error-dismiss') return;
    if (busy) {
      if (control.dataset.transientDisabled === undefined) {
        control.dataset.transientDisabled = String(control.disabled);
      }
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
    } else if (control.dataset.transientDisabled !== undefined) {
      control.disabled = control.dataset.transientDisabled === 'true';
      delete control.dataset.transientDisabled;
      control.setAttribute('aria-disabled', String(control.disabled));
    }
  });
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
  setState({ editorReady: isReady, hasImage: isReady });
  document.body.dataset.editorReady = String(isReady);
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
  mountInspectorContextContainers();
  bus.on(events.appStateChange, (state) => renderInspectorContext(state));
  document.querySelector('#error-retry')?.addEventListener('click', () => retryOperation());
  document.querySelector('#error-dismiss')?.addEventListener('click', () => dismissError());
  setEditorReady(false);
  renderInspectorContext(appState);
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
      showToast(`${button.dataset.tool[0].toUpperCase()}${button.dataset.tool.slice(1)} tool selected`);
    });
  });

  const tabs = Array.from(document.querySelectorAll('[data-inspector]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchInspector(tab.dataset.inspector));
  });

  // A tablist is only operable from the keyboard if the arrows move between
  // tabs and Home/End jump to the ends. Roving tabindex keeps one predictable
  // entry point while the arrow handlers retain access to every tab.
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
  initInspectorTabScroller(tabs);

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
  document.querySelector('[data-action="help"]')?.addEventListener('click', () => {
    openDialog(document.querySelector('#help-dialog'), { focus: '#help-cancel-secondary' });
  });
  document.querySelector('#help-cancel')?.addEventListener('click', () => closeDialog(document.querySelector('#help-dialog')));
  document.querySelector('#help-cancel-secondary')?.addEventListener('click', () => closeDialog(document.querySelector('#help-dialog')));
  document.querySelectorAll('#edit-panel details.panel-accordion').forEach((section) => {
    section.addEventListener('toggle', () => {
      if (!section.open) return;
      closeOtherAccordions(section);
      // Opening an accordion directly (not through a data-panel quick
      // action) must still mount a lazy panel — the id encodes the name.
      activatePanel(section.id.replace(/-accordion$/, ''));
    });
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

function focusPanel(panel) {
  switchInspector('edit');
  const section = document.querySelector(`#${panel}-accordion`);
  if (!section) return;
  closeOtherAccordions(section);
  section.open = true;
  activatePanel(panel);
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
    tab.setAttribute('tabindex', active ? '0' : '-1');
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
  activatePanel(name);
}
export async function withBusy(button, message, fn, options = {}) {
  const { status = null, operation = message, retry = null } = options;
  if (!button) return fn();
  const token = beginOperation({ operation, retry });
  if (token === null) return null;
  const originalHTML = button.innerHTML;
  const originalLabel = button.getAttribute('aria-label');
  button.disabled = true;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', message);
  button.innerHTML = `<span class="sr-only">${message}</span>`;
  if (status) status.textContent = `${message}…`;
  try {
    const result = await fn();
    completeOperation(token);
    return result;
  } catch (error) {
    failOperation(token, error, operation);
    return null;
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.innerHTML = originalHTML;
    button.removeAttribute('aria-busy');
    if (originalLabel === null) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', originalLabel);
  }
}

export { dismissError, retryOperation };

// Dialog lifecycle lives in lib/dialogs.js — the stack of open dialogs,
// the single Escape handler, the focus trap and confirmDialog. ui-manager
// owned these until Phase 4 of the restructuring plan; re-exporting keeps
// every existing `from './ui-manager.js'` import working unchanged.
export {
  openDialog,
  closeDialog,
  confirmDialog,
  initDialogEscape,
  initDialogFocusTrap,
  openDialogCount,
} from './lib/dialogs.js';

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
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
  tabs.forEach((tab) => tab.setAttribute('tabindex', tab.dataset.inspector === 'edit' ? '0' : '-1'));
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
