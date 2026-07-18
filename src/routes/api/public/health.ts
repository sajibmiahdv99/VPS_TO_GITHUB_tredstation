import { createFileRoute } from "@tanstack/react-router";
import { healthPayload } from "@/lib/observability.server";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => Response.json(healthPayload()),
    },
  },
});
