import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useOrdersRealtime } from "@/hooks/useOrdersRealtime";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";

function AppLayout() {
  useOrdersRealtime();
  useBrowserNotifications();
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});
