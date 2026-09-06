async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/images", {
    method: "POST",
    body: formData,
  });

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The API returned an invalid response.");
  }

  return { ok: response.ok, status: response.status, data: result };
}
