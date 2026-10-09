import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimsFromJwt } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/route-guard";
import { authPasswordErrorMessage, validatePasswordChange } from "@/lib/auth/password-rules";

// Troca de senha obrigatória (Fase 6, fatia 6.6; decisão 3.6): troca a senha com a sessão do
// próprio usuário, limpa a marca must_change_password do perfil (escrita só pela chave de serviço:
// o cliente não altera profiles — A-DB-12) e renova a sessão para o token sair sem a marca.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { password?: unknown; confirm?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";

  const fields = validatePasswordChange({ password, confirm });
  if (Object.keys(fields).length > 0) return Response.json({ error: "Dados inválidos.", fields }, { status: 422 });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return Response.json(
      { error: "Dados inválidos.", fields: { password: authPasswordErrorMessage(error.code) } },
      { status: 422 },
    );
  }

  const userId = String(data.claims.sub ?? "");
  const { error: flagError } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (flagError) return Response.json({ error: "Não foi possível concluir a troca de senha." }, { status: 500 });

  await supabase.auth.refreshSession();
  return Response.json({ redirectTo: homeForRole(claimsFromJwt(data.claims).appRole) });
}
