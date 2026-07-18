import { createFileRoute } from "@tanstack/react-router";
import { invokeMcpTool } from "@/lib/mcp";

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let args: unknown = {};
        try {
          args = await request.json();
        } catch {
          /* empty body ok */
        }
        try {
          const result = await invokeMcpTool(params.tool, args);
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "tool error" },
            { status: 400 },
          );
        }
      },
    },
  },
});
