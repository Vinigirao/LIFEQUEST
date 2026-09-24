import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta: ignora o RLS.
 * Usar SOMENTE no servidor (cron dos lembretes, webhook e tokens do Strava).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
