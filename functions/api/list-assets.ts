/// <summary>
/// Lists a room's uploaded R2 assets (tokens/portraits/maps), namespaced by the
/// `{kind}/{roomId}--` key prefix. Feeds the DM-only Assets page (Phase 7). POST
/// { roomId } → { assets: [{ key, url, kind, size, uploaded }] }.
/// </summary>
const KINDS = ["tokens", "portraits", "maps"] as const;

export const onRequestPost: PagesFunction<{ UPLOADS: R2Bucket }> = async (context) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  let roomId = "";
  try {
    const body = (await context.request.json()) as { roomId?: string };
    roomId = typeof body?.roomId === "string" ? body.roomId : "";
  } catch {
    return json({ error: "Invalid payload." }, 400);
  }
  if (!roomId) {
    return json({ error: "Missing room id." }, 400);
  }
  if (!context.env.UPLOADS) {
    // No R2 bound (local dev): report an empty, well-formed list.
    return json({ assets: [], unconfigured: true });
  }

  const assets: Array<{ key: string; url: string; kind: string; size: number; uploaded: string }> = [];
  for (const kind of KINDS) {
    let cursor: string | undefined;
    do {
      const listed = await context.env.UPLOADS.list({ prefix: `${kind}/${roomId}--`, cursor, limit: 1000 });
      for (const obj of listed.objects) {
        assets.push({
          key: obj.key,
          url: `/${obj.key}`,
          kind,
          size: obj.size,
          uploaded: obj.uploaded instanceof Date ? obj.uploaded.toISOString() : String(obj.uploaded),
        });
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  return json({ assets });
};
