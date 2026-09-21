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

export function initUI() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      setState({ activeTool: button.dataset.tool });
      showToast(`${button.dataset.tool[0].toUpperCase()}${button.dataset.tool.slice(1)} tool selected`);
    });
  });

  document.querySelectorAll('[data-inspector]').forEach((tab) => {
    tab.addEventListener('click', () => switchInspector(tab.dataset.inspector));
  });

  document.querySelectorAll('[data-panel]').forEach((button) => {
    const panel = button.dataset.panel;
    if (READY_PANELS.has(panel)) {
      button.addEventListener('click', () => focusPanel(panel));
    } else if (panel === 'history' || panel === 'analysis' || panel === 'pipeline') {
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
  document.querySelectorAll('#properties-panel details.panel-accordion').forEach((section) => {
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
  switchInspector('properties');
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
  document.querySelectorAll('#properties-panel details.panel-accordion').forEach((section) => {
    if (section !== activeSection) section.open = false;
  });
}


export function switchInspector(name) {
  setState({ activeInspector: name });
  document.querySelectorAll('[data-inspector]').forEach((tab) => {
    const active = tab.dataset.inspector === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelector('#properties-panel').hidden = name !== 'properties';
  document.querySelector('#layers-panel').hidden = name !== 'layers';
  const analysisPanel = document.querySelector('#analysis-panel');
  if (analysisPanel) analysisPanel.hidden = name !== 'analysis';
  const historyPanel = document.querySelector('#history-panel');
  if (historyPanel) historyPanel.hidden = name !== 'history';
  const pipelinePanel = document.querySelector('#pipeline-panel');
  if (pipelinePanel) pipelinePanel.hidden = name !== 'pipeline';
  // On mobile the panels live in the drawer, so switching to one must also
  // reveal it — otherwise the tap changes hidden state behind nothing.
  if (isMobile()) openInspectorDrawer();
}

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function label(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
