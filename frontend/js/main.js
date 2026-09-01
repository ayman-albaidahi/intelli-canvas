document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("image-file");
  const statusEl = document.getElementById("upload-status");
  const metaEl = document.getElementById("image-meta");

  const setStatus = (message, type = "success") => {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = "block";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = fileInput.files[0];
    if (!file) {
      setStatus("Please select an image before uploading.", "error");
      return;
    }

    setStatus("Uploading image...");
    metaEl.hidden = true;

    try {
      const result = await uploadImage(file);

      if (!result.ok) {
        const message = result.data?.error?.message || "Upload failed.";
        setStatus(message, "error");
        return;
      }

      const image = result.data.image;
      setStatus(`Upload succeeded. Image ID: ${image.image_id}`, "success");
      metaEl.textContent = JSON.stringify(image, null, 2);
      metaEl.hidden = false;
    } catch (error) {
      setStatus("The upload request could not be completed.", "error");
    }
  });
});
