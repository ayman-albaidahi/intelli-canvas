class CanvasManager {
  constructor(canvas, stage) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("CanvasManager requires a canvas element.");
    }

    this.canvas = canvas;
    this.stage = stage || canvas.parentElement;
    this.context = canvas.getContext("2d");
    this.image = null;
    this.imageSource = null;
    this.imageBounds = null;

    this.minZoom = 0.1; // 10% minimum zoom
    this.maxZoom = 4.0; // 400% maximum zoom
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.initialPanOffset = { x: 0, y: 0 };

    this.stagePadding = 24; // Visual margin for fit-to-canvas

    this.onZoomChange = null;

    if (!this.context) {
      throw new Error("The browser could not create a 2D canvas context.");
    }

    this.initEvents();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage || this.canvas);
    this.resize();
  }

  initEvents() {
    this.handleWheel = (event) => {
      if (!this.image) return;
      event.preventDefault();

      const clientPoint = { x: event.clientX, y: event.clientY };
      const zoomFactor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      const targetZoom = this.zoomLevel * zoomFactor;

      this.setZoom(targetZoom, clientPoint);
    };

    this.handleMouseDown = (event) => {
      if (!this.image) return;
      if (event.button === 0 || event.button === 1) {
        this.isPanning = true;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.initialPanOffset = { x: this.panOffset.x, y: this.panOffset.y };
        this.stage.classList.add("is-panning");
        event.preventDefault();
      }
    };

    this.handleMouseMove = (event) => {
      if (!this.isPanning) return;
      const dx = event.clientX - this.panStart.x;
      const dy = event.clientY - this.panStart.y;
      this.panOffset.x = this.initialPanOffset.x + dx;
      this.panOffset.y = this.initialPanOffset.y + dy;
      this.clampPan();
      this.render();
    };

    this.handleMouseUp = () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.stage.classList.remove("is-panning");
      }
    };

    this.handleCanvasStageMouseDown = (event) => {
      if (event.target === this.canvas || this.stage.contains(event.target)) {
        if (!event.target.closest("button") && !event.target.closest("label") && !event.target.closest("input")) {
          this.handleMouseDown(event);
        }
      }
    };

    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.stage.addEventListener("mousedown", this.handleCanvasStageMouseDown);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  }

  async loadImage(source) {
    const image = await this.createImage(source);
    const previousObjectUrl = this.imageSource instanceof File ? this.image?.src : null;

    this.image = image;
    this.imageSource = source;

    if (previousObjectUrl) {
      URL.revokeObjectURL(previousObjectUrl);
    }

    this.fitToCanvas();
    this.resize();
    return this.getImageState();
  }

  createImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The image could not be loaded."));
      image.src = source instanceof File ? URL.createObjectURL(source) : source;
    });
  }

  getFitScale() {
    if (!this.image) return 1.0;
    const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    const availableWidth = Math.max(1, Math.floor(rect.width) - this.stagePadding * 2);
    const availableHeight = Math.max(1, Math.floor(rect.height) - this.stagePadding * 2);

    const scaleX = availableWidth / this.image.naturalWidth;
    const scaleY = availableHeight / this.image.naturalHeight;
    return Math.min(scaleX, scaleY, 1.0);
  }

  clampPan() {
    if (!this.image) return;

    const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    const scale = this.zoomLevel;
    const imgW = this.image.naturalWidth * scale;
    const imgH = this.image.naturalHeight * scale;

    const minVisibleX = Math.min(60, imgW * 0.25);
    const minVisibleY = Math.min(60, imgH * 0.25);

    const maxPanX = cssWidth / 2 + imgW / 2 - minVisibleX;
    const minPanX = -(cssWidth / 2 + imgW / 2 - minVisibleX);

    const maxPanY = cssHeight / 2 + imgH / 2 - minVisibleY;
    const minPanY = -(cssHeight / 2 + imgH / 2 - minVisibleY);

    this.panOffset.x = Math.min(Math.max(this.panOffset.x, minPanX), maxPanX);
    this.panOffset.y = Math.min(Math.max(this.panOffset.y, minPanY), maxPanY);
  }

  resetZoom() {
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.notifyZoom();
    this.render();
  }

  fitToCanvas() {
    if (!this.image) {
      this.zoomLevel = 1.0;
      this.panOffset = { x: 0, y: 0 };
      this.notifyZoom();
      this.render();
      return;
    }

    const fitScale = this.getFitScale();
    this.zoomLevel = Math.min(Math.max(fitScale, this.minZoom), this.maxZoom);
    this.panOffset = { x: 0, y: 0 };
    this.notifyZoom();
    this.render();
  }

  setZoom(level, clientPoint = null) {
    const clampedZoom = Math.min(Math.max(level, this.minZoom), this.maxZoom);
    if (Math.abs(clampedZoom - this.zoomLevel) < 0.0001) return;

    if (clientPoint && this.image) {
      const canvasPoint = this.clientToCanvas(clientPoint);
      const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));

      const oldScale = this.zoomLevel;
      const newScale = clampedZoom;

      const centerImageX = (canvasPoint.x - (cssWidth / 2 + this.panOffset.x)) / oldScale;
      const centerImageY = (canvasPoint.y - (cssHeight / 2 + this.panOffset.y)) / oldScale;

      this.panOffset.x = canvasPoint.x - cssWidth / 2 - centerImageX * newScale;
      this.panOffset.y = canvasPoint.y - cssHeight / 2 - centerImageY * newScale;
    }

    this.zoomLevel = clampedZoom;
    this.clampPan();
    this.notifyZoom();
    this.render();
  }

  zoomIn(step = 1.15) {
    this.setZoom(this.zoomLevel * step);
  }

  zoomOut(step = 1.15) {
    this.setZoom(this.zoomLevel / step);
  }

  notifyZoom() {
    if (typeof this.onZoomChange === "function") {
      this.onZoomChange(Math.round(this.zoomLevel * 100));
    }
  }

  resize() {
    const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(cssWidth * devicePixelRatio);
    this.canvas.height = Math.floor(cssHeight * devicePixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    this.clampPan();
    this.render();
  }

  render() {
    const rect = this.stage?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.context.clearRect(0, 0, cssWidth, cssHeight);

    if (!this.image) {
      this.imageBounds = null;
      return;
    }

    const scale = this.zoomLevel;
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    const x = (cssWidth - width) / 2 + this.panOffset.x;
    const y = (cssHeight - height) / 2 + this.panOffset.y;

    this.imageBounds = { x, y, width, height, scale };
    this.context.drawImage(this.image, x, y, width, height);
  }

  canvasToImage(point) {
    if (!this.imageBounds) return null;

    return {
      x: (point.x - this.imageBounds.x) / this.imageBounds.scale,
      y: (point.y - this.imageBounds.y) / this.imageBounds.scale,
    };
  }

  imageToCanvas(point) {
    if (!this.imageBounds) return null;

    return {
      x: this.imageBounds.x + point.x * this.imageBounds.scale,
      y: this.imageBounds.y + point.y * this.imageBounds.scale,
    };
  }

  clientToCanvas(point) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }

  clientToImage(point) {
    return this.canvasToImage(this.clientToCanvas(point));
  }

  imageToClient(point) {
    const canvasPoint = this.imageToCanvas(point);
    if (!canvasPoint) return null;

    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + canvasPoint.x, y: rect.top + canvasPoint.y };
  }

  isPointInsideImage(point) {
    if (!this.imageBounds) return false;

    return (
      point.x >= this.imageBounds.x &&
      point.x <= this.imageBounds.x + this.imageBounds.width &&
      point.y >= this.imageBounds.y &&
      point.y <= this.imageBounds.y + this.imageBounds.height
    );
  }

  getImageState() {
    if (!this.image) return null;

    return {
      width: this.image.naturalWidth,
      height: this.image.naturalHeight,
      aspectRatio: this.image.naturalWidth / this.image.naturalHeight,
      bounds: this.imageBounds,
      zoomLevel: this.zoomLevel,
    };
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.stage.removeEventListener("mousedown", this.handleCanvasStageMouseDown);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);

    if (this.imageSource instanceof File && this.image?.src) {
      URL.revokeObjectURL(this.image.src);
    }
  }
}

window.CanvasManager = CanvasManager;
