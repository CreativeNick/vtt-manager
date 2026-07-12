import { handleImageUpload, roomKeyPrefix } from "../_shared/imageUpload";

/// <summary>
/// Accepts portrait uploads and stores them in R2 for production deployments.
/// </summary>
export const onRequestPost: PagesFunction = async (context) =>
  handleImageUpload(context.request, context.env, {
    folder: "portraits",
    buildKey: (body, ext) => {
      if (!body.slotId || typeof body.slotId !== "string") {
        throw new Error("Missing slot id.");
      }
      return `portraits/${roomKeyPrefix(body)}${body.slotId}.${ext}`;
    },
    buildUrl: (key) => `/${key}`,
  });
