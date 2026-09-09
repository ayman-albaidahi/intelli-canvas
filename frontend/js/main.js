document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("image-file");
  const statusEl = document.getElementById("upload-status");
  const metaEl = document.getElementById("image-meta");
  const dimensionsEl = document.getElementById("canvas-dimensions");
  const canvas = document.getElementById("image-canvas");
  const stage = document.getElementById("canvas-stage");
  const canvasUploadButton = document.getElementById("canvas-upload-button");
  const transformButtons = [...document.querySelectorAll("[data-transform]")];

  const zoomInButton = document.getElementById("zoom-in-button");
  const zoomOutButton = document.getElementById("zoom-out-button");
  const zoomResetButton = document.getElementById("zoom-reset-button");
  const zoomFitButton = document.getElementById("zoom-fit-button");
  const zoomLevelText = document.getElementById("zoom-level-text");

  const canvasManager = new CanvasManager(canvas, stage);
  let imageId = null;

  canvasManager.onZoomChange = (zoomPercentage) => {
    if (zoomLevelText) zoomLevelText.textContent = `${zoomPercentage}%`;
  };

  const setStatus = (message, type = "success") => {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.hidden = false;
    statusEl.style.display = "block";
  };

  const setTransformButtonsEnabled = (enabled) => {
    transformButtons.forEach((button) => {
      button.disabled = !enabled;
    });
  };

  const openFilePicker = () => {
    fileInput.value = "";
    fileInput.click();
  };

  const isSupportedImage = (file) => {
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    return file instanceof File && supportedTypes.includes(file.type);
  };

  const showImage = async (fileOrUrl) => {
    if (fileOrUrl instanceof File && !isSupportedImage(fileOrUrl)) {
      setStatus("Please choose a PNG, JPG, JPEG, or WEBP image.", "error");
      return null;
    }

    const imageState = await canvasManager.loadImage(fileOrUrl);
    stage.classList.add("has-image");
    dimensionsEl.textContent = `${imageState.width} × ${imageState.height}px`;
    return imageState;
  };

  const uploadSession = async (file, imageState) => {
    try {
      const result = await uploadImage(file);
      if (!result.ok) {
        throw new Error(result.data?.error?.message || "Upload failed.");
      }

      const image = result.data.image;
      imageId = image.image_id;
      setTransformButtonsEnabled(true);
      metaEl.textContent = JSON.stringify({
        ...image,
        width: imageState.width,
        height: imageState.height,
        aspect_ratio: imageState.aspectRatio.toFixed(4),
      }, null, 2);
      setStatus(`Image ready · ${image.original_filename}`, "success");
    } catch (error) {
      imageId = null;
      setTransformButtonsEnabled(false);
      setStatus("Image displayed, but the upload session could not be created.", "error");
      console.error(error);
    }
  };

  const handleImage = async (file) => {
    try {
      setStatus("Loading image...", "pending");
      const imageState = await showImage(file);
      if (imageState) await uploadSession(file, imageState);
    } catch (error) {
      setStatus("The image could not be displayed.", "error");
      console.error(error);
    }
  };

  const applyTransform = async (operation) => {
    if (!imageId) return;

    const operationConfig = {
      "rotate-left": { path: "rotate", payload: { image_id: imageId, angle: -90 } },
      "rotate-right": { path: "rotate", payload: { image_id: imageId, angle: 90 } },
      "flip-horizontal": { path: "flip", payload: { image_id: imageId, direction: "horizontal" } },
      "flip-vertical": { path: "flip", payload: { image_id: imageId, direction: "vertical" } },
    }[operation];
    if (!operationConfig) return;

    setTransformButtonsEnabled(false);
    setStatus("Applying transformation...", "pending");
    try {
      const result = await transformImage(operationConfig.path, operationConfig.payload);
      if (!result.ok) {
        throw new Error(result.data?.error?.message || "Transformation failed.");
      }

      const imageState = await showImage(getImageContentUrl(imageId));
      metaEl.textContent = JSON.stringify({
        ...result.data.image,
        width: imageState.width,
        height: imageState.height,
        aspect_ratio: imageState.aspectRatio.toFixed(4),
      }, null, 2);
      setStatus("Transformation applied successfully.", "success");
    } catch (error) {
      setStatus(error.message || "The transformation failed.", "error");
      console.error(error);
    } finally {
      setTransformButtonsEnabled(Boolean(imageId));
    }
  };

  form.addEventListener("submit", (event) => event.preventDefault());
  fileInput.addEventListener("change", () => handleImage(fileInput.files[0]));
  canvasUploadButton.addEventListener("click", openFilePicker);
  transformButtons.forEach((button) => {
    button.addEventListener("click", () => applyTransform(button.dataset.transform));
  });

  if (zoomInButton) zoomInButton.addEventListener("click", () => canvasManager.zoomIn());
  if (zoomOutButton) zoomOutButton.addEventListener("click", () => canvasManager.zoomOut());
  if (zoomResetButton) zoomResetButton.addEventListener("click", () => canvasManager.resetZoom());
  if (zoomFitButton) zoomFitButton.addEventListener("click", () => canvasManager.fitToCanvas());

  ["dragenter", "dragover"].forEach((eventName) => {
    stage.addEventListener(eventName, (event) => {
      event.preventDefault();
      stage.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    stage.addEventListener(eventName, (event) => {
      event.preventDefault();
      stage.classList.remove("is-dragging");
    });
  });

  stage.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) handleImage(file);
  });

  setTransformButtonsEnabled(false);
  window.addEventListener("beforeunload", () => canvasManager.destroy());
});
