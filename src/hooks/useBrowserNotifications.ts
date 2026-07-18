// Subscribes to the user's notifications table via realtime and shows
// browser Notification toasts when permission is granted. Also exposes a
// helper to request permission from a user gesture.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  event_type: string;
};

export function useBrowserNotifications() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;

      channel = supabase
        .channel(`notif:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as NotificationRow;
            if (Notification.permission !== "granted") return;
            try {
              new Notification(row.title, {
                body: row.body ?? undefined,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                tag: row.id,
              });
            } catch { /* ignore */ }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}
