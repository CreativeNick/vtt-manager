import { handleImageUpload } from "../_shared/imageUpload";

/// <summary>
/// Accepts map layer image uploads and stores them in R2 for production deployments.
/// </summary>
export const onRequestPost: PagesFunction = async (context) =>
  handleImageUpload(context.request, context.env, {
    folder: "maps",
    buildKey: (body, ext) => {
      if (!body.sceneId || typeof body.sceneId !== "string") {
        throw new Error("Missing scene id.");
      }
      if (!body.layerId || typeof body.layerId !== "string") {
        throw new Error("Missing layer id.");
      }
      return `maps/${body.sceneId}-${body.layerId}.${ext}`;
    },
    buildUrl: (key) => `/${key}`,
    extraFields: (body) => ({
      layerId: body.layerId,
      width: body.width,
      height: body.height,
    }),
  });
