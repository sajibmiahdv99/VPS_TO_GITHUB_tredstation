import type { z } from "zod";

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
};

export type McpToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  annotations?: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => McpToolResult | Promise<McpToolResult>;
};

export function defineTool(def: McpToolDef): McpToolDef {
  return def;
}
