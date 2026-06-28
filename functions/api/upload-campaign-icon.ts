import { handleImageUpload } from "../_shared/imageUpload";

/// <summary>
/// Accepts campaign icon uploads and stores them in R2 for production deployments.
/// </summary>
export const onRequestPost: PagesFunction = async (context) =>
  handleImageUpload(context.request, context.env, {
    folder: "campaign-icons",
    buildKey: (body, ext) => {
      if (!body.roomId || typeof body.roomId !== "string") {
        throw new Error("Missing room id.");
      }
      return `campaign-icons/${body.roomId}.${ext}`;
    },
    buildUrl: (key) => `/${key}`,
  });
