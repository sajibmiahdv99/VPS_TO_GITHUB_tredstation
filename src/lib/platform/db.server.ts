// Untyped admin client for tables not yet in generated Database types.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminDb = supabaseAdmin as any;
