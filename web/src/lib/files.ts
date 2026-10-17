import type { Capabilities } from "./contract";
export const defaultLimits: Capabilities["limits"] = {
  max_file_bytes: 20 * 1024 * 1024,
  max_files: 200,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
};
/** Stays under the server proxy's 128 MiB request limit, including multipart overhead. */
export const MAX_COMBINED_BYTES = 120 * 1024 * 1024;
export function validateFiles(
  files: File[],
  limits = defaultLimits,
): string | null {
  if (!files.length) return "Choose at least one image.";
  if (files.length > limits.max_files)
    return `Choose up to ${limits.max_files} images at a time.`;
  for (const file of files) {
    if (!limits.allowed_mime_types.includes(file.type))
      return `${file.name}: unsupported file type. Use ${limits.allowed_mime_types.map((t) => t.split("/")[1].toUpperCase()).join(", ")}.`;
    if (file.size === 0) return `${file.name}: the file is empty.`;
    if (file.size > limits.max_file_bytes)
      return `${file.name}: exceeds the ${Math.floor(limits.max_file_bytes / 1024 / 1024)} MB limit.`;
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_COMBINED_BYTES)
    return "The combined upload exceeds 120 MB. Upload fewer or smaller images at a time.";
  return null;
}
export async function validateImages(
  files: File[],
  limits = defaultLimits,
): Promise<void> {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (
            limits.max_image_pixels &&
            img.naturalWidth * img.naturalHeight > limits.max_image_pixels
          )
            reject(
              new Error(
                `${file.name}: exceeds the ${limits.max_image_pixels / 1_000_000} megapixel limit.`,
              ),
            );
          else if (img.naturalWidth > 0) resolve();
          else reject(new Error(`${file.name}: invalid image.`));
        };
        img.onerror = () =>
          reject(
            new Error(
              `${file.name}: the image could not be decoded. Choose a valid JPEG, PNG or WebP.`,
            ),
          );
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
