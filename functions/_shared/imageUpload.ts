import { parseImageDataUrl } from "../../src/lib/imageDataUrl";

type UploadBody = {
  dataUrl?: string;
};

/// <summary>
/// Writes an uploaded image to R2 and returns a JSON response with its public path.
/// </summary>
export async function handleImageUpload(
  request: Request,
  env: { UPLOADS: R2Bucket },
  options: {
    folder: "portraits" | "tokens" | "maps";
    buildKey: (body: UploadBody & Record<string, unknown>, ext: string) => string;
    buildUrl: (key: string) => string;
    extraFields?: (body: UploadBody & Record<string, unknown>) => Record<string, unknown>;
  },
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.UPLOADS) {
    return new Response(
      JSON.stringify({
        error: "Image uploads are not configured. Bind an R2 bucket named UPLOADS in wrangler.toml.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = (await request.json()) as UploadBody & Record<string, unknown>;
    if (!body?.dataUrl) {
      return new Response(JSON.stringify({ error: "Invalid upload payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { bytes, contentType, ext } = parseImageDataUrl(body.dataUrl);
    const key = options.buildKey(body, ext);
    await env.UPLOADS.put(key, bytes, {
      httpMetadata: { contentType },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        url: options.buildUrl(key),
        ...(options.extraFields?.(body) ?? {}),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Upload failed.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/// <summary>
/// Streams a stored image from R2 for portrait, token, and map URLs.
/// </summary>
export async function serveStoredImage(
  env: { UPLOADS: R2Bucket },
  folder: "portraits" | "tokens" | "maps",
  filename: string,
): Promise<Response> {
  if (!env.UPLOADS) {
    return new Response("Image storage is not configured.", { status: 503 });
  }

  const object = await env.UPLOADS.get(`${folder}/${filename}`);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
