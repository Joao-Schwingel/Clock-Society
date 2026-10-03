import type { UsersRepo } from "./repo";
import { createUserSchema, fieldErrors, updateUserSchema } from "./schemas";

// Regras da gestão de usuários (Fase 6, fatia 6.5). Recebe o repositório por parâmetro para ser
// testável sem banco. Toda validação de vínculo roda ANTES de criar o login (V-API-04).

export interface ServiceResult {
  status: number;
  body: unknown;
}

const invalid = (fields: Record<string, string>): ServiceResult => ({
  status: 422,
  body: { error: "Dados inválidos.", fields },
});

export async function createUser(repo: UsersRepo, tenantId: string, input: unknown): Promise<ServiceResult> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const data = parsed.data;

  if (await repo.emailExists(data.email)) {
    return { status: 409, body: { error: "Já existe um usuário com este e-mail." } };
  }

  const isVendor = data.role === "vendedor";
  const ids = isVendor ? [...new Set(data.salesperson_ids)] : [];
  if (ids.length > 0) {
    const inTenant = await repo.salespersonIdsInTenant(ids, tenantId);
    if (inTenant.length !== ids.length) return invalid({ salesperson_ids: "Vendedor inválido." });
    const linked = await repo.linkedSalespersonIds(ids);
    if (linked.length > 0) {
      return { status: 409, body: { error: "Este vendedor já está vinculado a outro login." } };
    }
  }
  const newSalesperson = isVendor ? data.new_salesperson : undefined;
  if (newSalesperson && !(await repo.companyInTenant(newSalesperson.company_id, tenantId))) {
    return invalid({ new_salesperson: "Empresa inválida." });
  }

  let userId: string;
  try {
    userId = await repo.createAuthUser({
      email: data.email,
      password: data.password,
      appRole: data.role,
      tenantId,
      fullName: data.full_name,
    });
  } catch {
    return { status: 500, body: { error: "Não foi possível criar o usuário." } };
  }

  try {
    await repo.updateProfile(userId, { must_change_password: true, full_name: data.full_name });
    const toLink = [...ids];
    if (newSalesperson) {
      toLink.push(
        await repo.createSalesperson({ name: newSalesperson.name, companyId: newSalesperson.company_id, tenantId }),
      );
    }
    if (toLink.length > 0) await repo.linkSalespersons(userId, toLink);
  } catch {
    // Compensação: sem isso sobraria um login sem perfil completo ou sem vínculo.
    await repo.deleteAuthUser(userId).catch(() => undefined);
    return { status: 500, body: { error: "Não foi possível criar o usuário." } };
  }

  return { status: 201, body: { id: userId } };
}

export async function updateUser(
  repo: UsersRepo,
  tenantId: string,
  requesterId: string,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrors(parsed.error));
  const data = parsed.data;

  const profile = await repo.getProfile(userId);
  if (!profile || profile.tenant_id !== tenantId) {
    return { status: 404, body: { error: "Usuário não encontrado." } };
  }
  if (data.is_active === false && userId === requesterId) {
    return invalid({ is_active: "Você não pode desativar o próprio usuário." });
  }

  if (data.full_name !== undefined) await repo.updateProfile(userId, { full_name: data.full_name });
  if (data.is_active !== undefined) {
    await repo.updateProfile(userId, { is_active: data.is_active });
    await repo.setLoginBlocked(userId, !data.is_active);
  }
  if (data.reset_password !== undefined) {
    await repo.setPassword(userId, data.reset_password);
    await repo.updateProfile(userId, { must_change_password: true });
  }

  return { status: 200, body: { ok: true } };
}
