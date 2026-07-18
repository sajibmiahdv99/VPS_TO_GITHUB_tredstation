// Self-hosted MCP endpoint (Lovable mcp-js removed).
// Minimal JSON-RPC-ish surface for list/invoke used by Hermes tools.

import { createFileRoute } from "@tanstack/react-router";
import { listMcpTools, invokeMcpTool } from "@/lib/mcp";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          name: "hermes-mcp",
          title: "Hermes Agent Workstation MCP",
          version: "0.1.0",
          tools: listMcpTools(),
        });
      },
      POST: async ({ request }) => {
        let body: { method?: string; params?: { name?: string; arguments?: unknown } };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
        const method = body.method ?? "tools/list";
        if (method === "tools/list") {
          return Response.json({ tools: listMcpTools() });
        }
        if (method === "tools/call") {
          const name = body.params?.name;
          if (!name) return Response.json({ error: "name required" }, { status: 400 });
          try {
            const result = await invokeMcpTool(name, body.params?.arguments ?? {});
            return Response.json(result);
          } catch (e) {
            return Response.json(
              { error: e instanceof Error ? e.message : "tool error" },
              { status: 400 },
            );
          }
        }
        return Response.json({ error: `unsupported method: ${method}` }, { status: 400 });
      },
    },
  },
});
