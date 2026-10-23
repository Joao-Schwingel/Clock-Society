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
  // 022: o login é de UMA pessoa. Quem atende várias empresas é a pessoa, pelos seus acessos.
  const salespersonId = isVendor ? data.salesperson_id : undefined;
  if (salespersonId) {
    if (!(await repo.salespersonInTenant(salespersonId, tenantId))) {
      return invalid({ salesperson_id: "Vendedor inválido." });
    }
    if (await repo.salespersonHasLogin(salespersonId)) {
      return { status: 409, body: { error: "Este vendedor já está vinculado a outro login." } };
    }
  }

  const newSalesperson = isVendor ? data.new_salesperson : undefined;
  if (newSalesperson) {
    const companyIds = [...new Set(newSalesperson.company_ids)];
    const inTenant = await repo.companiesInTenant(companyIds, tenantId);
    if (inTenant.length !== companyIds.length) return invalid({ new_salesperson: "Empresa inválida." });
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
  } catch (error) {
    console.error("[api/users] falha ao criar o login no Auth:", error);
    return { status: 500, body: { error: "Não foi possível criar o usuário." } };
  }

  try {
    // O perfil é criado aqui, e não deixado a cargo do gatilho: ver repo.ts, ensureProfile().
    await repo.ensureProfile({
      id: userId,
      tenantId,
      role: data.role,
      fullName: data.full_name,
      mustChangePassword: true,
    });
    const pessoaId =
      salespersonId ??
      (newSalesperson
        ? await repo.createSalesperson({
            name: newSalesperson.name,
            companyIds: [...new Set(newSalesperson.company_ids)],
            tenantId,
          })
        : undefined);
    if (pessoaId) await repo.linkSalesperson(userId, pessoaId);
  } catch (error) {
    // A mensagem ao usuário é genérica de propósito, mas o motivo precisa aparecer no servidor:
    // sem isto, a falha do perfil/vínculo era invisível (o login criado some na compensação).
    console.error("[api/users] falha após criar o login; desfazendo:", error);
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
  // Nenhum administrador pode ser desativado — nem o próprio, nem outro. O gatilho da migration 020
  // garante o mesmo no banco.
  if (data.is_active === false && profile.role === "admin") {
    return invalid({ is_active: "Usuários administradores não podem ser desativados." });
  }

  try {
    if (data.full_name !== undefined) await repo.updateProfile(userId, { full_name: data.full_name });
    if (data.is_active !== undefined) {
      await repo.updateProfile(userId, { is_active: data.is_active });
      await repo.setLoginBlocked(userId, !data.is_active);
    }
    if (data.reset_password !== undefined) {
      await repo.setPassword(userId, data.reset_password);
      await repo.updateProfile(userId, { must_change_password: true });
    }
  } catch (error) {
    console.error("[api/users] falha ao salvar as alterações:", error);
    return { status: 500, body: { error: "Não foi possível salvar as alterações." } };
  }

  return { status: 200, body: { ok: true } };
}
