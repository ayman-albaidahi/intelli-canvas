import { INSPECTOR_CONTEXTS } from './inspector-context.js';

const CONTEXT_COPY = {
  empty: ['Nothing selected', 'Select an object or choose an editing tool.'],
  image: ['Image editing', 'Edit the current image with focused actions.'],
  layer: ['Layer editing', 'Edit the selected layer without unrelated image controls.'],
  brush: ['Brush settings', 'Adjust the brush before drawing on the active canvas.'],
  eraser: ['Eraser settings', 'Adjust the eraser before removing marks from the active canvas.'],
  crop: ['Crop settings', 'Set the framing, then apply or cancel the crop.'],
  processing: ['Processing', 'The current operation is being prepared. Conflicting actions are paused.'],
  error: ['Action failed', 'Review the message and retry or dismiss the failed operation.'],
};

function createContextSection(context) {
  const section = document.createElement('section');
  section.id = `edit-context-${context}`;
  section.className = 'edit-context';
  section.dataset.editContext = context;
  section.setAttribute('role', 'region');
  section.setAttribute('aria-labelledby', `edit-context-${context}-heading`);
  const [title, copy] = CONTEXT_COPY[context];
  const summary = context === 'image'
    ? `<div class="context-summary image-context-summary" id="image-context-summary" aria-live="polite">
        <div><span>File</span><strong id="image-context-name">No image loaded</strong></div>
        <div><span>Dimensions</span><strong id="image-context-dimensions">—</strong></div>
        <div><span>Status</span><strong id="image-context-status">Waiting for an image</strong></div>
      </div>`
    : context === 'layer'
      ? `<div class="context-summary layer-context-summary" id="layer-context-summary" aria-live="polite">
          <div><span>Type</span><strong id="layer-context-type">—</strong></div>
          <div><span>Visibility</span><strong id="layer-context-visibility">—</strong></div>
          <button class="button button-secondary full-width" id="layer-context-toggle-visibility" type="button">Toggle visibility</button>
        </div>`
      : context === 'crop'
        ? `<div class="context-summary crop-context-summary" id="crop-context-summary" aria-live="polite">
            <div><span>Selection</span><strong id="crop-context-size">Not started</strong></div>
            <p>Use the handles on the canvas to frame the crop, then apply or cancel it below the canvas.</p>
          </div>`
        : context === 'processing'
          ? `<div class="context-summary processing-context-summary" id="processing-context-summary" role="status" aria-live="polite">
              <strong id="processing-operation">Working…</strong>
              <p id="processing-progress">Please wait while the operation completes.</p>
            </div>`
          : context === 'error'
            ? `<div class="context-summary error-context-summary" id="error-context-summary" role="alert" aria-live="assertive">
                <strong id="error-operation">Action failed</strong>
                <p id="error-message">The operation could not be completed.</p>
                <div class="context-actions"><button class="button button-primary" id="error-retry" type="button">Retry</button><button class="button button-secondary" id="error-dismiss" type="button">Dismiss</button></div>
              </div>`
      : '';
  section.innerHTML = `<div class="edit-context-heading"><span class="eyebrow">Inspector context</span><h3 id="edit-context-${context}-heading">${title}</h3><p>${copy}</p></div>${summary}`;
  return section;
}

function moveInto(root, selector, section) {
  const element = root.querySelector(selector);
  if (element && element.parentElement !== section) section.appendChild(element);
}

/** Mounts the stable context containers and preserves existing component IDs. */
export function mountInspectorContextContainers(root = document) {
  const stack = root.querySelector('#edit-context-stack');
  if (!stack) return null;

  const sections = new Map();
  INSPECTOR_CONTEXTS.forEach((context) => {
    const section = root.querySelector(`#edit-context-${context}`) || createContextSection(context);
    sections.set(context, section);
    if (section.parentElement !== stack) stack.appendChild(section);
  });

  // Existing controls keep their IDs and listeners; only their contextual host
  // changes. This lets PR-2C add richer Image/Layer content incrementally.
  moveInto(root, '#object-empty', sections.get('empty'));
  moveInto(root, '#object-properties', sections.get('layer'));
  moveInto(root, '.inspector-quick-actions', sections.get('image'));
  moveInto(root, '.panel-section', sections.get('image'));
  // Smart Crop is an image-level suggestion and remains available from the
  // Image context. The Crop tool context is reserved for the interactive crop
  // tool itself, which will populate this container in PR-2E.
  moveInto(root, '#smart-crop-accordion', sections.get('image'));
  moveInto(root, '#quick-accordion', sections.get('image'));
  moveInto(root, '#drawing-accordion', sections.get('brush'));
  moveInto(root, '#eraser-accordion', sections.get('eraser'));

  return sections;
}

/** Shows exactly one context and removes inactive contexts from the tab order. */
export function renderInspectorContextContainers(context, root = document) {
  const sections = root.querySelectorAll('[data-edit-context]');
  sections.forEach((section) => {
    const active = section.dataset.editContext === context;
    section.hidden = !active;
    section.inert = !active;
    section.setAttribute('aria-hidden', String(!active));
    if (active && (section.dataset.editContext === 'brush' || section.dataset.editContext === 'eraser')) {
      section.querySelectorAll('details').forEach((details) => { details.open = true; });
    }
  });
  return context;
}

export function renderImageContextSummary(summary = {}, root = document) {
  const name = root.querySelector('#image-context-name');
  const dimensions = root.querySelector('#image-context-dimensions');
  const status = root.querySelector('#image-context-status');
  if (!name || !dimensions || !status) return;
  name.textContent = summary.name || 'No image loaded';
  dimensions.textContent = summary.width && summary.height ? `${summary.width} × ${summary.height}` : '—';
  status.textContent = summary.status || (summary.name ? 'Ready to edit' : 'Waiting for an image');
}

export function renderLayerContextSummary(layer = null, root = document) {
  const type = root.querySelector('#layer-context-type');
  const visibility = root.querySelector('#layer-context-visibility');
  const toggle = root.querySelector('#layer-context-toggle-visibility');
  if (!type || !visibility || !toggle) return;
  type.textContent = layer?.typeLabel || layer?.type || '—';
  visibility.textContent = layer ? (layer.visible ? 'Visible' : 'Hidden') : '—';
  toggle.disabled = !layer || layer.locked;
  toggle.setAttribute('aria-pressed', String(Boolean(layer?.visible)));
  toggle.textContent = layer?.visible ? 'Hide layer' : 'Show layer';
}

export function renderTransientContext(state = {}, root = document) {
  const operation = root.querySelector('#processing-operation');
  const progress = root.querySelector('#processing-progress');
  const errorOperation = root.querySelector('#error-operation');
  const message = root.querySelector('#error-message');
  const retry = root.querySelector('#error-retry');
  if (operation) operation.textContent = state.processing?.operation ? `${state.processing.operation}…` : 'Working…';
  if (progress) progress.textContent = state.processing?.progress == null
    ? 'Please wait while the operation completes.'
    : `${state.processing.progress}% complete`;
  if (errorOperation) errorOperation.textContent = state.error?.operation || 'Action failed';
  if (message) message.textContent = state.error?.message || 'The operation could not be completed.';
  if (retry) retry.hidden = !state.error?.retryable;
}
