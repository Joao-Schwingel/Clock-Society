import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de serviço: ignora o RLS. SÓ no servidor (o `server-only` quebra o build se
// este arquivo for importado num Client Component — V-API-06). Usado apenas por
// lib/users/supabase-repo.ts, depois de requireAdmin() ter conferido o papel.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
