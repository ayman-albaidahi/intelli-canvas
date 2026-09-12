import { appState, setState } from './app-state.js';

const toast = document.querySelector('#toast');
let toastTimer;

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
    button.addEventListener('click', () => showToast(`${label(button.dataset.panel)} panel is ready for the next stage`));
  });

  document.querySelector('[data-action="compare"]')?.addEventListener('click', () => showToast('Live comparison will be connected in the comparison stage'));
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => showToast('Export is ready for the image pipeline stage'));
  document.querySelector('[data-action="new"]')?.addEventListener('click', () => showToast('New project workspace is ready'));
  document.querySelector('[data-action="add-layer"]')?.addEventListener('click', () => showToast('Layer creation will be enabled in the layers stage'));
}

export function switchInspector(name) {
  setState({ activeInspector: name });
  document.querySelectorAll('[data-inspector]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.inspector === name));
  document.querySelector('#properties-panel').hidden = name !== 'properties';
  document.querySelector('#layers-panel').hidden = name !== 'layers';
}

export function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function label(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
