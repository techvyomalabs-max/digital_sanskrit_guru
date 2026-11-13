// Phone photos are often 3-8 MB; storage takes up to 2 MB. Big photos are redrawn as a JPEG
// at most `maxSide` pixels on the long side before upload. Small ones are sent as they are.
const SHRINK_FROM_BYTES = 1.5 * 1024 * 1024;

export async function shrinkImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!file || typeof window === "undefined" || typeof document === "undefined") return file;
  if (file.size <= SHRINK_FROM_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    const name = String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
