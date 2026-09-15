import { escapeHtml } from './escape-html.js';

const DEFAULT_PARAMETERS = {
  brightness: { value: 100 }, contrast: { value: 100 }, saturation: { value: 100 },
  gamma: { value: 1 }, blur: { value: 2 }, sharpen: { value: 1 }, threshold: { value: 128 },
  sobel: { ksize: 3 }, 'median-filter': { ksize: 3 }, morphology: { operation: 'open', ksize: 3 },
  grayscale: {}, negative: {}, laplacian: {},
};

const OPERATION_LABELS = {
  gamma: 'Tone balance', blur: 'Soft focus', sharpen: 'Detail sharpen',
  grayscale: 'Black & white', negative: 'Invert colors', threshold: 'High contrast',
  sobel: 'Detail boost', laplacian: 'Edge enhance', 'median-filter': 'Noise reducer',
  morphology: 'Texture refine',
};

export class PipelineManager {
  constructor({ apiClient, canvasManager, showToast }) {
    this.apiClient = apiClient;
    this.canvasManager = canvasManager;
    this.showToast = showToast;
    this.list = document.querySelector('#pipeline-list');
    this.operation = document.querySelector('#pipeline-operation');
    this.version = document.querySelector('#pipeline-version');
    this.status = document.querySelector('#pipeline-preview-status');
    this.panel = document.querySelector('#pipeline-panel');
    this.retry = document.querySelector('[data-action="pipeline-retry"]');
    this.pipeline = { version: 1, nodes: [] };
    this.busy = false;
    this.bind();
    document.addEventListener('appstatechange', () => this.refresh());
    this.refresh();
  }

  bind() {
    document.querySelector('[data-action="pipeline-add"]')?.addEventListener('click', () => this.add());
    document.querySelector('[data-action="pipeline-preview"]')?.addEventListener('click', () => this.preview());
    document.querySelector('[data-action="pipeline-apply"]')?.addEventListener('click', () => this.apply());
    this.retry?.addEventListener('click', () => this.refresh());
    this.list?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pipeline-action]');
      if (!button || this.busy) return;
      const node = button.closest('[data-node-id]')?.dataset.nodeId;
      if (!node) return;
      const action = button.dataset.pipelineAction;
      if (action === 'toggle') this.toggle(node);
      if (action === 'delete') this.remove(node);
      if (action === 'up') this.move(node, -1);
      if (action === 'down') this.move(node, 1);
    });
    this.list?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-node-parameter]');
      if (!input || this.busy) return;
      const row = input.closest('[data-node-id]');
      const node = this.pipeline.nodes.find((item) => item.id === row.dataset.nodeId);
      if (!node) return;
      const value = input.type === 'number' ? Number(input.value) : input.value;
      this.update(node.id, { parameters: { ...node.parameters, [input.dataset.nodeParameter]: value } });
    });
    this.list?.addEventListener('keydown', (event) => {
      const row = event.target.closest('[data-node-id]');
      if (!row || (!event.altKey && event.key !== 'Enter')) return;
      if (event.key === 'ArrowUp') { event.preventDefault(); this.move(row.dataset.nodeId, -1); }
      if (event.key === 'ArrowDown') { event.preventDefault(); this.move(row.dataset.nodeId, 1); }
      if (event.key === 'Enter' && event.target === row) { event.preventDefault(); this.toggle(row.dataset.nodeId); }
    });
  }

  async refresh() {
    if (!this.apiClient.imageId || this.busy) return;
    try {
      this.pipeline = await this.apiClient.pipeline();
      this.render();
      this.setStatus('Pipeline loaded.', false);
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  async add() {
    if (this.busy || !this.apiClient.imageId) return this.showToast('Upload an image first');
    await this.run(() => this.apiClient.addPipelineNode({ operation: this.operation.value, parameters: DEFAULT_PARAMETERS[this.operation.value] || {} }));
  }

  async preview() {
    if (this.busy || !this.apiClient.imageId) return this.showToast('Upload an image first');
    await this.run(async () => {
      const blob = await this.apiClient.previewPipeline(this.pipeline.nodes);
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        this.canvasManager.setPreviewOverlay(image);
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        this.setStatus('Preview image could not be displayed. Try again.', true);
      };
      image.src = url;
      this.setStatus('Preview ready — apply to commit one History entry.', false);
      return this.pipeline;
    });
  }

  async apply() {
    if (this.busy || !this.apiClient.imageId) return this.showToast('Upload an image first');
    await this.run(async () => {
      const image = await this.apiClient.applyPipeline(this.pipeline.nodes);
      this.canvasManager.setPreviewOverlay(null);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(image.image_id), image);
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.setStatus(`Applied pipeline · cache ${image.cache_hit ? 'hit' : 'generated'}`, false);
      this.showToast('Pipeline applied as one History entry');
      return this.pipeline;
    });
  }

  async update(nodeId, changes) {
    await this.run(() => this.apiClient.updatePipelineNode(nodeId, changes));
  }

  async toggle(nodeId) {
    await this.run(() => this.apiClient.togglePipelineNode(nodeId));
  }

  async remove(nodeId) {
    await this.run(() => this.apiClient.deletePipelineNode(nodeId));
  }

  async move(nodeId, delta) {
    const index = this.pipeline.nodes.findIndex((node) => node.id === nodeId);
    const target = index + delta;
    if (target < 0 || target >= this.pipeline.nodes.length) return;
    await this.run(() => this.apiClient.reorderPipelineNode(nodeId, target));
  }

  async run(operation) {
    this.busy = true;
    if (this.panel) this.panel.setAttribute('aria-busy', 'true');
    this.setStatus('Working…', false);
    try {
      this.pipeline = await operation();
      this.render();
    } catch (error) {
      this.setStatus(error.message, true);
      this.showToast(`Pipeline error: ${error.message}`);
    } finally {
      this.busy = false;
      if (this.panel) this.panel.setAttribute('aria-busy', 'false');
    }
  }

  setStatus(message, isError) {
    if (!this.status) return;
    this.status.hidden = !message;
    this.status.textContent = message || '';
    this.status.classList.toggle('is-error', Boolean(isError));
    if (this.retry) this.retry.hidden = !isError;
  }

  render() {
    if (!this.list) return;
    this.version.textContent = `v${this.pipeline.version || 1}`;
    if (!this.pipeline.nodes?.length) {
      this.list.innerHTML = '<div class="empty-panel"><div class="panel-icon">≋</div><strong>No pipeline operations</strong><p>Add an operation to build a reusable processing sequence.</p></div>';
      return;
    }
    this.list.innerHTML = this.pipeline.nodes.map((node, index) => {
      const parameters = Object.entries(node.parameters || {}).map(([key, value]) => {
        if (typeof value === 'boolean' || typeof value === 'object') return '';
        return `<label>${escapeHtml(key)}<input type="number" data-node-parameter="${escapeHtml(key)}" value="${escapeHtml(value)}" step="any" /></label>`;
      }).join('');
      const label = OPERATION_LABELS[node.operation] || node.operation;
      return `<div class="pipeline-row${node.enabled ? '' : ' is-disabled'}" data-node-id="${escapeHtml(node.id)}" tabindex="0" role="listitem" aria-label="${escapeHtml(label)} operation, ${node.enabled ? 'enabled' : 'disabled'}"><div class="pipeline-row-head"><span class="pipeline-drag" aria-hidden="true">☰</span><strong>${escapeHtml(label)}</strong><span class="pipeline-order" aria-label="Order ${index + 1}">${index + 1}</span><button class="mini-button" data-pipeline-action="toggle" aria-label="${node.enabled ? 'Disable' : 'Enable'} ${escapeHtml(label)}" title="Enable or disable">${node.enabled ? 'On' : 'Off'}</button><button class="mini-button" data-pipeline-action="up" aria-label="Move ${escapeHtml(label)} up" title="Move up">↑</button><button class="mini-button" data-pipeline-action="down" aria-label="Move ${escapeHtml(label)} down" title="Move down">↓</button><button class="mini-button" data-pipeline-action="delete" aria-label="Delete ${escapeHtml(label)}" title="Delete">×</button></div><div class="pipeline-params">${parameters || '<span class="muted">No parameters</span>'}</div></div>`;
    }).join('');
  }
}
