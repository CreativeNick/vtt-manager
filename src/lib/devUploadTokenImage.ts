import { readImageFromFile } from "./sceneUtils";

type UploadTokenImageResponse = {
  ok?: boolean;
  url?: string;
  error?: string;
};

/// <summary>
/// Uploads a token portrait via the Vite dev server so only a short URL is sent over WebSocket.
/// </summary>
export async function uploadTokenImageInDev(
  tokenId: string,
  file: File,
): Promise<{ url: string }> {
  const { dataUrl } = await readImageFromFile(file);

  const response = await fetch("/__dev/upload-token-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, dataUrl }),
  });

  const payload = (await response.json()) as UploadTokenImageResponse;
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? "Could not upload token image.");
  }

  return { url: payload.url };
}
