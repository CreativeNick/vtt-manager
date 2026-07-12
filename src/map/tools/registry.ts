import { selectTool } from "./select";
import { measureTool } from "./measure";
import { templateTool } from "./template";
import { drawTool } from "./draw";
import { calibrateTool } from "./calibrate";
import { fogTool } from "./fog";
import { wallsTool } from "./walls";
import { lightsTool } from "./lights";
import { pinTool } from "./pin";
import type { MapTool } from "./types";

/// <summary>
/// The map tool registry: one entry per tool module (same pattern as the panel
/// registry). Adding a tool = one module + one entry here.
/// </summary>
export const MAP_TOOLS: MapTool[] = [
  selectTool,
  measureTool,
  templateTool,
  drawTool,
  calibrateTool,
  fogTool,
  pinTool,
  wallsTool,
  lightsTool,
];

export function toolsForRole(isDm: boolean): MapTool[] {
  return MAP_TOOLS.filter((tool) => !tool.dmOnly || isDm);
}
