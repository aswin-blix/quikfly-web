// Photos chosen in the browser are shrunk to a JPEG before upload, so they stay well under
// the API's 2 MB limit (partner documents, rental checklist).
import { PHOTO_MAX_EDGE, PHOTO_QUALITY } from "./partner";

export async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", PHOTO_QUALITY));
}
