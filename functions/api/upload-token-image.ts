import { handleImageUpload } from "../_shared/imageUpload";

/// <summary>
/// Accepts token image uploads and stores them in R2 for production deployments.
/// </summary>
export const onRequestPost: PagesFunction = async (context) =>
  handleImageUpload(context.request, context.env, {
    folder: "tokens",
    buildKey: (body, ext) => {
      if (!body.tokenId || typeof body.tokenId !== "string") {
        throw new Error("Missing token id.");
      }
      return `tokens/${body.tokenId}.${ext}`;
    },
    buildUrl: (key) => `/${key}`,
  });
