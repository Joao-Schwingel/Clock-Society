import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de serviço: ignora o RLS. SÓ no servidor (o `server-only` quebra o build se
// este arquivo for importado num Client Component — V-API-06). Usado apenas por
// lib/users/supabase-repo.ts, depois de requireAdmin() ter conferido o papel.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Diz QUAL variável faltou: na Vercel, cada ambiente (Production/Preview) tem o seu conjunto, e a
  // mensagem genérica mandava procurar a chave de serviço quando o que faltava era a URL.
  const faltando = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (!url || !serviceKey) {
    throw new Error(
      `${faltando.join(" e ")} não configurada(s) no servidor. ` +
        "Na Vercel, confira o escopo do ambiente (Production/Preview) e refaça o deploy depois de cadastrar.",
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
