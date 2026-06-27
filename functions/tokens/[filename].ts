import { serveStoredImage } from "../_shared/imageUpload";

/// <summary>
/// Serves uploaded map token images from R2.
/// </summary>
export const onRequestGet: PagesFunction = async (context) => {
  const filename = context.params.filename;
  if (!filename || Array.isArray(filename)) {
    return new Response("Not found", { status: 404 });
  }
  return serveStoredImage(context.env, "tokens", filename);
};
