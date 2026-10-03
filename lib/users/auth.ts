import { createClient } from "@/lib/supabase/server";
import { claimsFromJwt } from "@/lib/auth/session";

// Guarda dos route handlers de /api/users: lê papel e inquilino das claims do token (§3.3).
export async function requireAdmin(): Promise<{ userId: string; tenantId: string } | Response> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const { appRole, tenantId } = claimsFromJwt(data.claims);
  if (appRole !== "admin" || !tenantId) return Response.json({ error: "Acesso negado." }, { status: 403 });

  return { userId: String(data.claims.sub ?? ""), tenantId };
}
