import { beforeEach, describe, expect, it } from 'vitest';
import {
  mountInspectorContextContainers,
  renderImageContextSummary,
  renderLayerContextSummary,
  renderInspectorContextContainers,
} from './inspector-context-view.js';

function markup() {
  return `<section id="edit-panel"><div id="edit-context-stack"></div>
    <div id="object-empty">empty</div>
    <div id="object-properties" hidden>layer controls</div>
    <div class="inspector-quick-actions">image actions</div>
    <div class="panel-section"><details id="smart-crop-accordion">crop controls</details><details id="adjustments-accordion">image controls</details></div>
    <details id="drawing-accordion">brush controls</details>
    <details id="quick-accordion">more image controls</details>
  </section>`;
}

describe('Inspector context containers', () => {
  beforeEach(() => {
    document.body.innerHTML = markup();
  });

  it('mounts one independent container for every official context', () => {
    const sections = mountInspectorContextContainers();
    expect(sections.size).toBe(8);
    expect(document.querySelectorAll('[data-edit-context]')).toHaveLength(8);
    expect(document.querySelector('#object-empty').closest('[data-edit-context]').dataset.editContext).toBe('empty');
    expect(document.querySelector('.inspector-quick-actions').closest('[data-edit-context]').dataset.editContext).toBe('image');
    expect(document.querySelector('#object-properties').closest('[data-edit-context]').dataset.editContext).toBe('layer');
    expect(document.querySelector('#drawing-accordion').closest('[data-edit-context]').dataset.editContext).toBe('brush');
    expect(document.querySelector('#smart-crop-accordion').closest('[data-edit-context]').dataset.editContext).toBe('image');
    expect(document.querySelector('#image-context-summary')).not.toBeNull();
    expect(document.querySelector('#layer-context-summary')).not.toBeNull();
  });

  it('renders image metadata without leaking it into the layer context', () => {
    mountInspectorContextContainers();
    renderImageContextSummary({ name: 'portrait.png', width: 1200, height: 800, status: 'Ready to edit' });
    expect(document.querySelector('#image-context-name').textContent).toBe('portrait.png');
    expect(document.querySelector('#image-context-dimensions').textContent).toBe('1200 × 800');
    expect(document.querySelector('#layer-context-summary').textContent).not.toContain('portrait.png');
  });

  it('renders layer type and visibility with a separate visibility action', () => {
    mountInspectorContextContainers();
    renderLayerContextSummary({ typeLabel: 'Brush stroke', visible: true, locked: false });
    expect(document.querySelector('#layer-context-type').textContent).toBe('Brush stroke');
    expect(document.querySelector('#layer-context-visibility').textContent).toBe('Visible');
    expect(document.querySelector('#layer-context-toggle-visibility').textContent).toBe('Hide layer');
    expect(document.querySelector('#layer-context-toggle-visibility').disabled).toBe(false);
  });

  it.each(['empty', 'image', 'layer', 'brush', 'eraser', 'crop', 'processing', 'error'])('shows only %s', (context) => {
    mountInspectorContextContainers();
    renderInspectorContextContainers(context);
    const sections = [...document.querySelectorAll('[data-edit-context]')];
    expect(sections.filter((section) => !section.hidden)).toHaveLength(1);
    expect(sections.find((section) => section.dataset.editContext === context).hidden).toBe(false);
    sections.filter((section) => section.dataset.editContext !== context).forEach((section) => {
      expect(section.inert).toBe(true);
      expect(section.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
