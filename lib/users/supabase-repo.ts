import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UsersRepo, UserSummary } from "./repo";

// Implementação real do UsersRepo, com a chave de serviço. Toda chamada aqui já passou por
// requireAdmin() e é escopada pelo tenantId do admin.

const BAN_FOREVER = "876000h"; // ~100 anos

export function createSupabaseUsersRepo(): UsersRepo {
  const db = createAdminClient();

  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  const allAuthUsers = async () => {
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    fail(error);
    return data.users;
  };

  return {
    async emailExists(email, exceptUserId) {
      return (await allAuthUsers()).some(
        (u) => u.email?.toLowerCase() === email.toLowerCase() && u.id !== exceptUserId,
      );
    },
    async salespersonHasLogin(id) {
      const { data, error } = await db.from("salespersons").select("profile_id").eq("id", id).maybeSingle();
      fail(error);
      return Boolean(data?.profile_id);
    },
    async salespersonInTenant(id, tenantId) {
      const { data, error } = await db
        .from("salespersons")
        .select("id")
        .eq("id", id)
        .eq("user_id", tenantId)
        .maybeSingle();
      fail(error);
      return Boolean(data);
    },
    async companiesInTenant(companyIds, tenantId) {
      if (companyIds.length === 0) return [];
      const { data, error } = await db.from("companies").select("id").in("id", companyIds).eq("user_id", tenantId);
      fail(error);
      return (data ?? []).map((r) => r.id as string);
    },
    async createSalesperson({ name, companyIds, tenantId }) {
      const { data, error } = await db
        .from("salespersons")
        .insert({ name, user_id: tenantId, is_active: true })
        .select("id")
        .single();
      fail(error);
      const id = data!.id as string;
      if (companyIds.length > 0) {
        // 022: os acessos por empresa vivem em salesperson_companies.
        const { error: acessoError } = await db
          .from("salesperson_companies")
          .insert(companyIds.map((company_id) => ({ salesperson_id: id, company_id })));
        fail(acessoError);
      }
      return id;
    },
    async createAuthUser({ email, password, appRole, tenantId, fullName }) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // vai para as claims pelo hook (014) e alimenta o gatilho on_auth_user_created (013+021).
        // O perfil, porém, é criado por ensureProfile(): o GoTrue aplica este app_metadata num
        // UPDATE depois do INSERT, então não dá para contar com o gatilho aqui.
        app_metadata: { app_role: appRole, tenant_id: tenantId },
        user_metadata: { full_name: fullName },
      });
      fail(error);
      return data.user!.id;
    },
    async ensureProfile({ id, tenantId, role, fullName, mustChangePassword }) {
      const { error } = await db.from("profiles").upsert(
        {
          id,
          tenant_id: tenantId,
          role,
          full_name: fullName,
          must_change_password: mustChangePassword,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      fail(error);
    },
    async deleteAuthUser(id) {
      const { error } = await db.auth.admin.deleteUser(id);
      fail(error);
    },
    async updateProfile(id, patch) {
      const { error } = await db.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      fail(error);
    },
    async linkSalesperson(profileId, salespersonId) {
      const { error } = await db
        .from("salespersons")
        .update({ profile_id: profileId })
        .eq("id", salespersonId)
        .is("profile_id", null); // corrida: não rouba a pessoa de outro login
      fail(error);
      const { data, error: conferirError } = await db
        .from("salespersons")
        .select("profile_id")
        .eq("id", salespersonId)
        .maybeSingle();
      fail(conferirError);
      if (data?.profile_id !== profileId) throw new Error("vendedor já vinculado a outro login");
    },
    async setLoginBlocked(id, blocked) {
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: blocked ? BAN_FOREVER : "none" });
      fail(error);
    },
    async setPassword(id, password) {
      const { error } = await db.auth.admin.updateUserById(id, { password });
      fail(error);
    },
    async setEmail(id, email) {
      // `email_confirm` é obrigatório aqui: sem ele o GoTrue guarda o endereço em `email_change` e
      // espera uma confirmação por e-mail que este produto não envia — o login continuaria o antigo.
      // A sessão aberta segue com o e-mail velho nas claims até renovar; nada depende disso
      // (o middleware lê app_role/tenant_id), e no próximo login já é o novo.
      const { error } = await db.auth.admin.updateUserById(id, { email, email_confirm: true });
      fail(error);
    },
    async getProfile(id) {
      const { data, error } = await db
        .from("profiles")
        .select("id, tenant_id, role, is_active, must_change_password, full_name")
        .eq("id", id)
        .maybeSingle();
      fail(error);
      return data;
    },
    async listUsers(tenantId) {
      const { data: profiles, error } = await db
        .from("profiles")
        .select("id, role, is_active, must_change_password, full_name")
        .eq("tenant_id", tenantId)
        .order("full_name");
      fail(error);
      const ids = (profiles ?? []).map((p) => p.id as string);

      // 022: a pessoa aponta para o login (1:1), e os acessos vêm de salesperson_companies.
      const { data: pessoas, error: pessoasError } = ids.length
        ? await db.from("salespersons").select("id, name, profile_id").in("profile_id", ids)
        : { data: [], error: null };
      fail(pessoasError);

      // Duas consultas em vez de embed: o mock server dos E2E não emula `!inner`/embeds.
      const pessoaIds = (pessoas ?? []).map((sp) => sp.id as string);
      const { data: acessos, error: acessosError } = pessoaIds.length
        ? await db.from("salesperson_companies").select("salesperson_id, company_id").in("salesperson_id", pessoaIds)
        : { data: [], error: null };
      fail(acessosError);
      const porPessoa = new Map<string, string[]>();
      for (const a of (acessos ?? []) as { salesperson_id: string; company_id: string }[]) {
        porPessoa.set(a.salesperson_id, [...(porPessoa.get(a.salesperson_id) ?? []), a.company_id]);
      }

      const porLogin = new Map(
        (pessoas ?? []).map((sp) => [
          sp.profile_id as string,
          {
            id: sp.id as string,
            name: sp.name as string,
            company_ids: porPessoa.get(sp.id as string) ?? [],
          },
        ]),
      );
      const emails = new Map((await allAuthUsers()).map((u) => [u.id, u.email ?? ""]));
      return (profiles ?? []).map(
        (p): UserSummary => ({
          id: p.id,
          email: emails.get(p.id) ?? "",
          full_name: p.full_name,
          role: p.role,
          is_active: p.is_active,
          must_change_password: p.must_change_password,
          salesperson: porLogin.get(p.id) ?? null,
        }),
      );
    },
  };
}
