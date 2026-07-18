import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const projectRef = process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID || "local";
        const issuer =
          process.env.SUPABASE_AUTH_ISSUER ||
          process.env.SUPABASE_URL?.replace(/\/$/, "") + "/auth/v1" ||
          `https://${projectRef}.supabase.co/auth/v1`;
        return Response.json({
          resource: `${url.origin}/mcp`,
          authorization_servers: [issuer],
          scopes_supported: ["openid", "profile", "email"],
          bearer_methods_supported: ["header"],
        });
      },
    },
  },
});
