import type { Plugin, ViteDevServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CampaignManifest } from "./src/lib/campaignManifest";
import {
  parseRegistryFile,
  serializeRegistryFile,
  upsertRegistryEntry,
  DEFAULT_CAMPAIGN_REGISTRY,
  type CampaignRegistryEntry,
} from "./src/lib/campaignRegistry";
import { parseImageDataUrl } from "./src/lib/imageDataUrl";
import type { Scene } from "./src/lib/types";

type SaveRequestBody = {
  activeSceneId: string;
  scenes: Scene[];
};

type UploadMapImageBody = {
  sceneId: string;
  layerId: string;
  dataUrl: string;
  width: number;
  height: number;
};

type UploadPortraitBody = {
  slotId: string;
  dataUrl: string;
};

type UploadTokenImageBody = {
  tokenId: string;
  dataUrl: string;
};

type UploadCampaignIconBody = {
  roomId: string;
  dataUrl: string;
};

type CampaignRoomBody = {
  roomId?: string;
  name?: string;
  iconUrl?: string | null;
};

/// <summary>
/// Returns the path to the shared campaign registry JSON file.
/// </summary>
function campaignRegistryPath(rootDir: string): string {
  return join(rootDir, "public", "campaign", "rooms.json");
}

/// <summary>
/// Reads the shared campaign registry from disk for local development.
/// </summary>
async function readRegistryFromDisk(rootDir: string): Promise<CampaignRegistryEntry[]> {
  try {
    const raw = await readFile(campaignRegistryPath(rootDir), "utf8");
    return parseRegistryFile(raw);
  } catch {
    const fallback = [...DEFAULT_CAMPAIGN_REGISTRY];
    await writeRegistryToDisk(rootDir, fallback);
    return fallback;
  }
}

/// <summary>
/// Writes the shared campaign registry to disk for local development.
/// </summary>
async function writeRegistryToDisk(
  rootDir: string,
  rooms: CampaignRegistryEntry[],
): Promise<void> {
  const filePath = campaignRegistryPath(rootDir);
  await mkdir(join(rootDir, "public", "campaign"), { recursive: true });
  await writeFile(filePath, serializeRegistryFile(rooms));
}

/// <summary>
/// Decodes a data URL into a binary buffer and file extension.
/// </summary>
function dataUrlToFile(dataUrl: string): { buffer: Buffer; ext: string } {
  const { bytes, ext } = parseImageDataUrl(dataUrl);
  return { buffer: Buffer.from(bytes), ext };
}

/// <summary>
/// Reads the full request body from a Node HTTP incoming message.
/// </summary>
function readRequestBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/// <summary>
/// Writes a map image data URL to public/maps and returns its served URL path.
/// </summary>
export async function writeMapImageToDisk(
  rootDir: string,
  sceneId: string,
  layerId: string,
  dataUrl: string,
): Promise<string> {
  const mapsDir = join(rootDir, "public", "maps");
  await mkdir(mapsDir, { recursive: true });
  const { buffer, ext } = dataUrlToFile(dataUrl);
  const filename = `${sceneId}-${layerId}.${ext}`;
  await writeFile(join(mapsDir, filename), buffer);
  return `/maps/${filename}`;
}

/// <summary>
/// Writes a character portrait data URL to public/portraits and returns its served URL path.
/// </summary>
export async function writePortraitToDisk(
  rootDir: string,
  slotId: string,
  dataUrl: string,
): Promise<string> {
  const portraitsDir = join(rootDir, "public", "portraits");
  await mkdir(portraitsDir, { recursive: true });
  const { buffer, ext } = dataUrlToFile(dataUrl);
  const filename = `${slotId}.${ext}`;
  await writeFile(join(portraitsDir, filename), buffer);
  return `/portraits/${filename}`;
}

/// <summary>
/// Writes a token image data URL to public/tokens and returns its served URL path.
/// </summary>
export async function writeTokenImageToDisk(
  rootDir: string,
  tokenId: string,
  dataUrl: string,
): Promise<string> {
  const tokensDir = join(rootDir, "public", "tokens");
  await mkdir(tokensDir, { recursive: true });
  const { buffer, ext } = dataUrlToFile(dataUrl);
  const filename = `${tokenId}.${ext}`;
  await writeFile(join(tokensDir, filename), buffer);
  return `/tokens/${filename}`;
}

/// <summary>
/// Writes a campaign icon data URL to public/campaign-icons and returns its served URL path.
/// </summary>
export async function writeCampaignIconToDisk(
  rootDir: string,
  roomId: string,
  dataUrl: string,
): Promise<string> {
  const iconsDir = join(rootDir, "public", "campaign-icons");
  await mkdir(iconsDir, { recursive: true });
  const { buffer, ext } = dataUrlToFile(dataUrl);
  const filename = `${roomId}.${ext}`;
  await writeFile(join(iconsDir, filename), buffer);
  return `/campaign-icons/${filename}`;
}

/// <summary>
/// Writes scene layers and fog masks to public/ and returns a path-based manifest.
/// </summary>
async function buildManifest(
  rootDir: string,
  body: SaveRequestBody,
): Promise<CampaignManifest> {
  const fogDir = join(rootDir, "public", "campaign", "fog");
  const campaignDir = join(rootDir, "public", "campaign");
  await mkdir(fogDir, { recursive: true });
  await mkdir(campaignDir, { recursive: true });

  const scenes: Scene[] = [];

  for (const scene of body.scenes) {
    const layers = [];
    for (const layer of scene.layers) {
      if (layer.url.startsWith("data:")) {
        const url = await writeMapImageToDisk(rootDir, scene.id, layer.id, layer.url);
        layers.push({ ...layer, url });
      } else {
        layers.push(layer);
      }
    }

    let fogDataUrl = scene.fogDataUrl;
    if (fogDataUrl?.startsWith("data:")) {
      const { buffer } = dataUrlToFile(fogDataUrl);
      const fogFilename = `${scene.id}.png`;
      await writeFile(join(fogDir, fogFilename), buffer);
      fogDataUrl = `/campaign/fog/${fogFilename}`;
    }

    scenes.push({ ...scene, layers, fogDataUrl });
  }

  const manifest: CampaignManifest = {
    version: 1,
    activeSceneId: body.activeSceneId,
    scenes,
  };

  await writeFile(
    join(campaignDir, "scenes.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

/// <summary>
/// Vite dev-only middleware that persists campaign scenes and map images under public/.
/// </summary>
export function devCampaignSavePlugin(): Plugin {
  return {
    name: "dev-campaign-save",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__dev/upload-map-image", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        void (async () => {
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as UploadMapImageBody;
            if (!body?.sceneId || !body?.layerId || !body?.dataUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid upload payload." }));
              return;
            }

            const url = await writeMapImageToDisk(
              server.config.root,
              body.sceneId,
              body.layerId,
              body.dataUrl,
            );
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: true,
                url,
                layerId: body.layerId,
                width: body.width,
                height: body.height,
              }),
            );
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Upload failed.",
              }),
            );
          }
        })();
      });

      server.middlewares.use("/__dev/upload-portrait", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        void (async () => {
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as UploadPortraitBody;
            if (!body?.slotId || !body?.dataUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid upload payload." }));
              return;
            }

            const url = await writePortraitToDisk(server.config.root, body.slotId, body.dataUrl);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, url }));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Upload failed.",
              }),
            );
          }
        })();
      });

      server.middlewares.use("/__dev/upload-token-image", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        void (async () => {
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as UploadTokenImageBody;
            if (!body?.tokenId || !body?.dataUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid upload payload." }));
              return;
            }

            const url = await writeTokenImageToDisk(server.config.root, body.tokenId, body.dataUrl);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, url }));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Upload failed.",
              }),
            );
          }
        })();
      });

      server.middlewares.use("/__dev/upload-campaign-icon", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        void (async () => {
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as UploadCampaignIconBody;
            if (!body?.roomId || !body?.dataUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid upload payload." }));
              return;
            }

            const url = await writeCampaignIconToDisk(server.config.root, body.roomId, body.dataUrl);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, url }));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Upload failed.",
              }),
            );
          }
        })();
      });

      server.middlewares.use("/__dev/campaign-rooms", (req, res, next) => {
        if (req.method === "GET") {
          void (async () => {
            try {
              const rooms = await readRegistryFromDisk(server.config.root);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ rooms }));
            } catch (error) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : "Could not load campaign rooms.",
                }),
              );
            }
          })();
          return;
        }

        if (req.method === "POST") {
          void (async () => {
            try {
              const raw = await readRequestBody(req);
              const body = JSON.parse(raw) as CampaignRoomBody;
              const roomId = body.roomId?.trim();
              const name = body.name?.trim();
              if (!roomId || !name) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "roomId and name are required." }));
                return;
              }

              const rooms = await readRegistryFromDisk(server.config.root);
              const nextRooms = upsertRegistryEntry(rooms, {
                roomId,
                name,
                iconUrl: body.iconUrl ?? null,
                createdAt: Date.now(),
              });
              await writeRegistryToDisk(server.config.root, nextRooms);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ rooms: nextRooms }));
            } catch (error) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  error:
                    error instanceof Error ? error.message : "Could not register campaign room.",
                }),
              );
            }
          })();
          return;
        }

        next();
      });

      server.middlewares.use("/__dev/save-campaign", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        void (async () => {
          try {
            const raw = await readRequestBody(req);
            const body = JSON.parse(raw) as SaveRequestBody;
            if (!body?.activeSceneId || !Array.isArray(body.scenes)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid campaign payload." }));
              return;
            }

            const manifest = await buildManifest(server.config.root, body);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, manifest }));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Save failed.",
              }),
            );
          }
        })();
      });
    },
  };
}
