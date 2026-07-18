import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on the `orders` table and invalidates
 * relevant TanStack Query caches, plus toasts on terminal state changes.
 * Safe to mount once at the app layout level.
 */
export function useOrdersRealtime() {
  const queryClient = useQueryClient();
  const lastFlashRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const channel = supabase
      .channel("orders-stream-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["active-orders"] });
          queryClient.invalidateQueries({ queryKey: ["order-history"] });
          queryClient.invalidateQueries({ queryKey: ["overview"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });

          const row = (payload.new ?? payload.old) as {
            id?: string;
            symbol?: string;
            status?: string;
            error_message?: string;
          } | null;
          if (!row?.id || !row.status) return;
          if (lastFlashRef.current[row.id] === row.status) return;
          lastFlashRef.current[row.id] = row.status;

          const label = `${row.symbol ?? "Order"} → ${row.status.toUpperCase()}`;
          if (row.status === "filled" || row.status === "closed") toast.success(label);
          else if (row.status === "rejected")
            toast.error(`${label}${row.error_message ? `: ${row.error_message}` : ""}`);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["active-orders"] });
          queryClient.invalidateQueries({ queryKey: ["order-history"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
