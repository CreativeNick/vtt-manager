import { readImageFromFile } from "./sceneUtils";

type UploadResponse = {
  ok?: boolean;
  url?: string;
  layerId?: string;
  width?: number;
  height?: number;
  error?: string;
};

/// <summary>
/// Parses a JSON upload response and surfaces clear errors for empty or invalid bodies.
/// </summary>
async function parseUploadResponse(response: Response): Promise<UploadResponse> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "Upload server returned an empty response."
        : `Upload failed (${response.status}). Image uploads may not be configured for this deployment.`,
    );
  }

  try {
    return JSON.parse(text) as UploadResponse;
  } catch {
    throw new Error(`Upload server returned invalid JSON (${response.status}).`);
  }
}

/// <summary>
/// Posts a JSON payload to the dev or production upload endpoint.
/// </summary>
async function postUpload(path: string, body: Record<string, unknown>): Promise<UploadResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseUploadResponse(response);
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? "Image upload failed.");
  }
  return payload;
}

/// <summary>
/// Uploads a character portrait and returns its public URL path.
/// </summary>
export async function uploadPortrait(slotId: string, file: File): Promise<{ url: string }> {
  const { dataUrl } = await readImageFromFile(file);
  const path = import.meta.env.DEV ? "/__dev/upload-portrait" : "/api/upload-portrait";
  const payload = await postUpload(path, { slotId, dataUrl });
  return { url: payload.url! };
}

/// <summary>
/// Uploads a map token image and returns its public URL path.
/// </summary>
export async function uploadTokenImage(tokenId: string, file: File): Promise<{ url: string }> {
  const { dataUrl } = await readImageFromFile(file);
  const path = import.meta.env.DEV ? "/__dev/upload-token-image" : "/api/upload-token-image";
  const payload = await postUpload(path, { tokenId, dataUrl });
  return { url: payload.url! };
}

/// <summary>
/// Uploads a map layer image and returns its URL plus layer metadata.
/// </summary>
export async function uploadMapImage(
  sceneId: string,
  file: File,
): Promise<{ url: string; layerId: string; width: number; height: number }> {
  const { dataUrl, width, height } = await readImageFromFile(file);
  const layerId = `layer-${crypto.randomUUID().slice(0, 8)}`;
  const path = import.meta.env.DEV ? "/__dev/upload-map-image" : "/api/upload-map-image";
  const payload = await postUpload(path, { sceneId, layerId, dataUrl, width, height });
  return {
    url: payload.url!,
    layerId: payload.layerId ?? layerId,
    width: payload.width ?? width,
    height: payload.height ?? height,
  };
}
