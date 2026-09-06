document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("image-file");
  const statusEl = document.getElementById("upload-status");
  const metaEl = document.getElementById("image-meta");
  const dimensionsEl = document.getElementById("canvas-dimensions");
  const canvas = document.getElementById("image-canvas");
  const stage = document.getElementById("canvas-stage");
  const canvasUploadButton = document.getElementById("canvas-upload-button");

  const canvasManager = new CanvasManager(canvas, stage);

  const setStatus = (message, type = "success") => {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.hidden = false;
    statusEl.style.display = "block";
  };

  const openFilePicker = () => {
    fileInput.value = "";
    fileInput.click();
  };

  const isSupportedImage = (file) => {
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    return file instanceof File && supportedTypes.includes(file.type);
  };

  const showImage = async (file) => {
    if (!isSupportedImage(file)) {
      setStatus("Please choose a PNG, JPG, JPEG, or WEBP image.", "error");
      return null;
    }

    const imageState = await canvasManager.loadImage(file);
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
      metaEl.textContent = JSON.stringify({
        ...image,
        width: imageState.width,
        height: imageState.height,
        aspect_ratio: imageState.aspectRatio.toFixed(4),
      }, null, 2);
      setStatus(`Image ready · ${image.original_filename}`, "success");
    } catch (error) {
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

  form.addEventListener("submit", (event) => event.preventDefault());
  fileInput.addEventListener("change", () => handleImage(fileInput.files[0]));
  canvasUploadButton.addEventListener("click", openFilePicker);

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

  window.addEventListener("beforeunload", () => canvasManager.destroy());
});
