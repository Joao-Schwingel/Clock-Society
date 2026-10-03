import { requireAdmin } from "@/lib/users/auth";
import { createUser } from "@/lib/users/service";
import { createSupabaseUsersRepo } from "@/lib/users/supabase-repo";

// Gestão de usuários (planejamento 3.1; Fase 6, fatia 6.5). Só admin.

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const users = await createSupabaseUsersRepo().listUsers(auth.tenantId);
  return Response.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => null);
  const result = await createUser(createSupabaseUsersRepo(), auth.tenantId, body);
  return Response.json(result.body, { status: result.status });
}
