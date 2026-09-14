import { escapeHtml } from './escape-html.js';

const DEFAULT_PARAMETERS = {
  brightness: { value: 100 }, contrast: { value: 100 }, saturation: { value: 100 },
  gamma: { value: 1 }, blur: { value: 2 }, sharpen: { value: 1 }, threshold: { value: 128 },
  sobel: { ksize: 3 }, 'median-filter': { ksize: 3 }, morphology: { operation: 'open', ksize: 3 },
  grayscale: {}, negative: {}, laplacian: {},
};

export class PipelineManager {
  constructor({ apiClient, showToast }) {
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.list = document.querySelector('#pipeline-list');
    this.operation = document.querySelector('#pipeline-operation');
    this.version = document.querySelector('#pipeline-version');
    this.pipeline = { version: 1, nodes: [] };
    this.busy = false;
    this.bind();
    document.addEventListener('appstatechange', () => this.refresh());
    this.refresh();
  }

  bind() {
    document.querySelector('[data-action="pipeline-add"]')?.addEventListener('click', () => this.add());
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
  }

  async refresh() {
    if (!this.apiClient.imageId || this.busy) return;
    try {
      this.pipeline = await this.apiClient.pipeline();
      this.render();
    } catch {
      /* The panel stays empty until an image is available. */
    }
  }

  async add() {
    if (this.busy || !this.apiClient.imageId) return this.showToast('Upload an image first');
    await this.run(() => this.apiClient.addPipelineNode({ operation: this.operation.value, parameters: DEFAULT_PARAMETERS[this.operation.value] || {} }));
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
    try {
      this.pipeline = await operation();
      this.render();
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
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
      return `<div class="pipeline-row${node.enabled ? '' : ' is-disabled'}" data-node-id="${escapeHtml(node.id)}"><div class="pipeline-row-head"><span class="pipeline-drag">☰</span><strong>${escapeHtml(node.operation)}</strong><span class="pipeline-order">${index + 1}</span><button class="mini-button" data-pipeline-action="toggle" title="Enable or disable">${node.enabled ? 'On' : 'Off'}</button><button class="mini-button" data-pipeline-action="up" title="Move up">↑</button><button class="mini-button" data-pipeline-action="down" title="Move down">↓</button><button class="mini-button" data-pipeline-action="delete" title="Delete">×</button></div><div class="pipeline-params">${parameters || '<span class="muted">No parameters</span>'}</div></div>`;
    }).join('');
  }
}
