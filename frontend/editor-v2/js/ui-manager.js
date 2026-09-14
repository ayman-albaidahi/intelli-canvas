import { appState, setState } from './app-state.js';

const toast = document.querySelector('#toast');
let toastTimer;

const READY_PANELS = new Set(['adjustments', 'filters']);

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
  section.open = true;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  section.classList.remove('is-flash');
  void section.offsetWidth;
  section.classList.add('is-flash');
}

export function switchInspector(name) {
  setState({ activeInspector: name });
  document.querySelectorAll('[data-inspector]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.inspector === name));
  document.querySelector('#properties-panel').hidden = name !== 'properties';
  document.querySelector('#layers-panel').hidden = name !== 'layers';
  const analysisPanel = document.querySelector('#analysis-panel');
  if (analysisPanel) analysisPanel.hidden = name !== 'analysis';
  const historyPanel = document.querySelector('#history-panel');
  if (historyPanel) historyPanel.hidden = name !== 'history';
  const pipelinePanel = document.querySelector('#pipeline-panel');
  if (pipelinePanel) pipelinePanel.hidden = name !== 'pipeline';
}

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function label(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
