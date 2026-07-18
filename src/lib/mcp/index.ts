import echoTool from "./tools/echo";
import appInfoTool from "./tools/app-info";
import type { McpToolDef } from "./types";

const tools: McpToolDef[] = [echoTool, appInfoTool];

export function listMcpTools() {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    annotations: t.annotations ?? {},
  }));
}

export async function invokeMcpTool(name: string, input: unknown) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  // Lightweight validation via zod fields when present
  const parsed: Record<string, unknown> = {};
  for (const [k, schema] of Object.entries(tool.inputSchema)) {
    const raw = (input as Record<string, unknown> | null)?.[k];
    parsed[k] = schema.parse(raw);
  }
  return tool.handler(parsed);
}

export default { tools, listMcpTools, invokeMcpTool };
