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
    async emailExists(email) {
      return (await allAuthUsers()).some((u) => u.email?.toLowerCase() === email.toLowerCase());
    },
    async linkedSalespersonIds(ids) {
      const { data, error } = await db.from("profile_salespersons").select("salesperson_id").in("salesperson_id", ids);
      fail(error);
      return (data ?? []).map((r) => r.salesperson_id as string);
    },
    async salespersonIdsInTenant(ids, tenantId) {
      const { data, error } = await db.from("salespersons").select("id").in("id", ids).eq("user_id", tenantId);
      fail(error);
      return (data ?? []).map((r) => r.id as string);
    },
    async companyInTenant(companyId, tenantId) {
      const { data, error } = await db.from("companies").select("id").eq("id", companyId).eq("user_id", tenantId);
      fail(error);
      return (data ?? []).length > 0;
    },
    async createSalesperson({ name, companyId, tenantId }) {
      const { data, error } = await db
        .from("salespersons")
        .insert({ name, company_id: companyId, user_id: tenantId, commission_percentage: 0, is_active: true })
        .select("id")
        .single();
      fail(error);
      return data!.id as string;
    },
    async createAuthUser({ email, password, appRole, tenantId, fullName }) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // lido pelo gatilho on_auth_user_created (013) para criar o perfil
        app_metadata: { app_role: appRole, tenant_id: tenantId },
        user_metadata: { full_name: fullName },
      });
      fail(error);
      return data.user!.id;
    },
    async deleteAuthUser(id) {
      const { error } = await db.auth.admin.deleteUser(id);
      fail(error);
    },
    async updateProfile(id, patch) {
      const { error } = await db.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      fail(error);
    },
    async linkSalespersons(profileId, salespersonIds) {
      const { error } = await db
        .from("profile_salespersons")
        .insert(salespersonIds.map((salesperson_id) => ({ profile_id: profileId, salesperson_id })));
      fail(error);
    },
    async setLoginBlocked(id, blocked) {
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: blocked ? BAN_FOREVER : "none" });
      fail(error);
    },
    async setPassword(id, password) {
      const { error } = await db.auth.admin.updateUserById(id, { password });
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
      const { data: links, error: linksError } = ids.length
        ? await db.from("profile_salespersons").select("profile_id, salespersons(id, name, company_id)").in("profile_id", ids)
        : { data: [], error: null };
      fail(linksError);
      const emails = new Map((await allAuthUsers()).map((u) => [u.id, u.email ?? ""]));
      return (profiles ?? []).map(
        (p): UserSummary => ({
          id: p.id,
          email: emails.get(p.id) ?? "",
          full_name: p.full_name,
          role: p.role,
          is_active: p.is_active,
          must_change_password: p.must_change_password,
          salespersons: (links ?? [])
            .filter((l) => l.profile_id === p.id)
            .flatMap((l) => (l.salespersons ? [l.salespersons as unknown as UserSummary["salespersons"][number]] : [])),
        }),
      );
    },
  };
}
