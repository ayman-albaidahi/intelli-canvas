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
  section.innerHTML = `<div class="edit-context-heading"><span class="eyebrow">Inspector context</span><h3 id="edit-context-${context}-heading">${title}</h3><p>${copy}</p></div>`;
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
  });
  return context;
}
