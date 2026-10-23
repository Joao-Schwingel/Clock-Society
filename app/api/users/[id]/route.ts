import { requireAdmin } from "@/lib/users/auth";
import { updateUser } from "@/lib/users/service";
import { createSupabaseUsersRepo } from "@/lib/users/supabase-repo";

// Editar nome, desativar/reativar e resetar a senha (Fase 6, fatia 6.5). Só admin.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = await updateUser(createSupabaseUsersRepo(), auth.tenantId, auth.userId, id, body);
  return Response.json(result.body, { status: result.status });
}
