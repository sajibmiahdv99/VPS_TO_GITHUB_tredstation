import { adminDb } from "./db.server";

export async function reportHealth(
  component: string,
  ok: boolean,
  meta: Record<string, unknown> = {},
  error?: string,
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      component,
      last_error: ok ? null : (error ?? "error"),
      meta,
      updated_at: new Date().toISOString(),
    };
    if (ok) patch.last_ok_at = new Date().toISOString();
    await adminDb.from("system_health").upsert(patch, { onConflict: "component" });
  } catch (e) {
    console.warn("[system_health]", e);
  }
}

export async function listHealth(): Promise<
  Array<{
    component: string;
    last_ok_at: string | null;
    last_error: string | null;
    meta: Record<string, unknown>;
    updated_at: string | null;
  }>
> {
  try {
    const { data, error } = await adminDb
      .from("system_health")
      .select("component,last_ok_at,last_error,meta,updated_at");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
