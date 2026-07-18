import { createFileRoute } from "@tanstack/react-router";
import { listMcpTools } from "@/lib/mcp";

export const Route = createFileRoute("/.mcp/list-tools")({
  server: {
    handlers: {
      GET: async () => Response.json({ tools: listMcpTools() }),
      POST: async () => Response.json({ tools: listMcpTools() }),
    },
  },
});
