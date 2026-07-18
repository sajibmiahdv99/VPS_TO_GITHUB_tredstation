import { z } from "zod";
import { defineTool } from "../types";

export default defineTool({
  name: "echo",
  title: "Echo",
  description: "Echo text back. Use to verify MCP connectivity.",
  inputSchema: { text: z.string().min(1).describe("Text to echo back.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ text }) => ({ content: [{ type: "text", text }] }),
});
