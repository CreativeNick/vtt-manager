/// <summary>
/// Decodes a data URL into raw bytes, MIME type, and file extension.
/// </summary>
export function parseImageDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
} {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const contentType = match[1];
  const ext =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/gif"
          ? "gif"
          : contentType === "image/svg+xml"
            ? "svg"
            : "png";

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { bytes, contentType, ext };
}
