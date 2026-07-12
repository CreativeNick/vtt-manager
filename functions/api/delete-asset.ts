/// <summary>
/// Deletes one uploaded R2 asset for the DM-only Assets page (Phase 7). POST
/// { roomId, key }. The key MUST start with `{tokens|portraits|maps}/{roomId}--` so a
/// room can only ever delete its own namespaced assets (no cross-room deletion).
/// </summary>
export const onRequestPost: PagesFunction<{ UPLOADS: R2Bucket }> = async (context) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  let roomId = "";
  let key = "";
  try {
    const body = (await context.request.json()) as { roomId?: string; key?: string };
    roomId = typeof body?.roomId === "string" ? body.roomId : "";
    key = typeof body?.key === "string" ? body.key : "";
  } catch {
    return json({ error: "Invalid payload." }, 400);
  }
  if (!roomId || !key) {
    return json({ error: "Missing room id or key." }, 400);
  }
  const allowed = ["tokens", "portraits", "maps"].some((kind) => key.startsWith(`${kind}/${roomId}--`));
  if (!allowed) {
    return json({ error: "Key does not belong to this room." }, 403);
  }
  if (!context.env.UPLOADS) {
    return json({ error: "Uploads are not configured." }, 503);
  }
  await context.env.UPLOADS.delete(key);
  return json({ ok: true });
};
