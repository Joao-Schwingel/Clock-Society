import { beforeEach, describe, expect, it } from "vitest";
import { createUser, updateUser } from "./service";
import type { UsersRepo } from "./repo";

// Fase 5 §5 "API de usuários" / Fase 6 fatia 6.5. Regras do serviço contra um repositório em
// memória — nenhum teste abre conexão com banco (Fase 1 §1).

const TENANT = "t1";

function fakeRepo() {
  const state = {
    emails: new Set<string>(["ja@existe.com"]),
    salespersons: [
      { id: "sp-ana", tenantId: TENANT, companyId: "comp-a" },
      { id: "sp-bruno", tenantId: TENANT, companyId: "comp-a" },
      { id: "sp-outro", tenantId: "t2", companyId: "comp-x" },
    ],
    companies: [{ id: "comp-a", tenantId: TENANT }],
    links: [{ profileId: "p-bruno", salespersonId: "sp-bruno" }],
    profiles: new Map<string, { id: string; tenant_id: string; role: string; is_active: boolean; must_change_password: boolean; full_name: string | null }>([
      ["p-bruno", { id: "p-bruno", tenant_id: TENANT, role: "vendedor", is_active: true, must_change_password: false, full_name: "Bruno" }],
      ["p-outro", { id: "p-outro", tenant_id: "t2", role: "vendedor", is_active: true, must_change_password: false, full_name: "X" }],
    ]),
    blocked: new Set<string>(),
    passwords: new Map<string, string>(),
    calls: [] as string[],
  };
  let seq = 0;
  const repo: UsersRepo = {
    async emailExists(email) { return state.emails.has(email.toLowerCase()); },
    async linkedSalespersonIds(ids) { return state.links.filter((l) => ids.includes(l.salespersonId)).map((l) => l.salespersonId); },
    async salespersonIdsInTenant(ids, tenantId) { return state.salespersons.filter((s) => ids.includes(s.id) && s.tenantId === tenantId).map((s) => s.id); },
    async companyInTenant(companyId, tenantId) { return state.companies.some((c) => c.id === companyId && c.tenantId === tenantId); },
    async createSalesperson({ name, companyId, tenantId }) { const id = `sp-new-${++seq}`; state.salespersons.push({ id, tenantId, companyId }); state.calls.push(`createSalesperson:${name}`); return id; },
    async createAuthUser({ email, appRole, tenantId, fullName }) {
      const id = `p-new-${++seq}`;
      state.emails.add(email.toLowerCase());
      // o gatilho on_auth_user_created cria o perfil a partir de app_metadata
      state.profiles.set(id, { id, tenant_id: tenantId, role: appRole, is_active: true, must_change_password: false, full_name: fullName });
      state.calls.push("createAuthUser");
      return id;
    },
    async deleteAuthUser(id) { state.profiles.delete(id); state.calls.push(`deleteAuthUser:${id}`); },
    async updateProfile(id, patch) { Object.assign(state.profiles.get(id)!, patch); },
    async linkSalespersons(profileId, ids) {
      if (ids.includes("sp-falha")) throw new Error("falha simulada");
      for (const salespersonId of ids) state.links.push({ profileId, salespersonId });
    },
    async setLoginBlocked(id, blocked) { if (blocked) state.blocked.add(id); else state.blocked.delete(id); },
    async setPassword(id, password) { state.passwords.set(id, password); },
    async getProfile(id) { return state.profiles.get(id) ?? null; },
    async listUsers() { return []; },
  };
  return { repo, state };
}

const valid = {
  full_name: "Ana Souza",
  email: "ana@loja.com",
  password: "temporaria123",
  role: "vendedor",
  salesperson_ids: ["sp-ana"],
};

let f: ReturnType<typeof fakeRepo>;
beforeEach(() => {
  f = fakeRepo();
});

describe("createUser", () => {
  it("V-API-01 — cria o vendedor com papel e vínculo a um registro existente; o perfil nasce com must_change_password", async () => {
    const res = await createUser(f.repo, TENANT, valid);
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(f.state.profiles.get(id)).toMatchObject({ role: "vendedor", tenant_id: TENANT, must_change_password: true, full_name: "Ana Souza" });
    expect(f.state.links).toContainEqual({ profileId: id, salespersonId: "sp-ana" });
  });

  it("V-API-01 — cria também um registro novo em salespersons e vincula", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_ids: [],
      new_salesperson: { name: "Carla", company_id: "comp-a" },
    });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(f.state.calls).toContain("createSalesperson:Carla");
    expect(f.state.links.some((l) => l.profileId === id && l.salespersonId.startsWith("sp-new-"))).toBe(true);
  });

  it("V-API-03 — e-mail duplicado → 409, em PT-BR, sem criar nada", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, email: "JA@existe.com" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Já existe um usuário com este e-mail." });
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("V-API-03 — payload inválido → 422 com as mensagens de campo em PT-BR", async () => {
    const res = await createUser(f.repo, TENANT, { email: "nao-e-email", password: "123", role: "chefe" });
    expect(res.status).toBe(422);
    const body = res.body as { error: string; fields: Record<string, string> };
    expect(body.error).toBe("Dados inválidos.");
    expect(body.fields.email).toBe("E-mail inválido.");
    expect(body.fields.password).toBe("A senha temporária precisa ter pelo menos 8 caracteres.");
    expect(body.fields.full_name).toBe("Informe o nome.");
    expect(body.fields.role).toBe("Papel inválido.");
  });

  it("V-API-04 — registro de vendedor que já tem login → 409 antes de criar o usuário", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_ids: ["sp-bruno"] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Este vendedor já está vinculado a outro login." });
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("registro de vendedor de outro inquilino → 422", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_ids: ["sp-outro"] });
    expect(res.status).toBe(422);
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("vendedor sem nenhum vínculo é recusado (422)", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_ids: [] });
    expect(res.status).toBe(422);
    expect((res.body as { fields: Record<string, string> }).fields.salesperson_ids).toBe("Vincule o vendedor a pelo menos um registro.");
  });

  it("falha depois de criar o login → desfaz o login (compensação) e devolve 500", async () => {
    f.state.salespersons.push({ id: "sp-falha", tenantId: TENANT, companyId: "comp-a" });
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_ids: ["sp-falha"] });
    expect(res.status).toBe(500);
    expect(f.state.calls.some((c) => c.startsWith("deleteAuthUser:"))).toBe(true);
  });
});

describe("updateUser", () => {
  it("V-API-05 — desativar: is_active = false e login bloqueado no Auth", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { is_active: false });
    expect(res.status).toBe(200);
    expect(f.state.profiles.get("p-bruno")!.is_active).toBe(false);
    expect(f.state.blocked.has("p-bruno")).toBe(true);
  });

  it("V-API-05 — reativar: is_active = true e bloqueio removido", async () => {
    await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { is_active: false });
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { is_active: true });
    expect(res.status).toBe(200);
    expect(f.state.profiles.get("p-bruno")!.is_active).toBe(true);
    expect(f.state.blocked.has("p-bruno")).toBe(false);
  });

  it("V-API-05 — resetar a senha grava a nova senha temporária e reativa must_change_password", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { reset_password: "novaSenha123" });
    expect(res.status).toBe(200);
    expect(f.state.passwords.get("p-bruno")).toBe("novaSenha123");
    expect(f.state.profiles.get("p-bruno")!.must_change_password).toBe(true);
  });

  it("usuário de outro inquilino → 404", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-outro", { is_active: false });
    expect(res.status).toBe(404);
    expect(f.state.profiles.get("p-outro")!.is_active).toBe(true);
  });

  it("erro do Auth/banco ao salvar → 500 com mensagem em PT-BR", async () => {
    f.repo.setLoginBlocked = async () => {
      throw new Error("falha simulada");
    };
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { is_active: false });
    expect(res).toEqual({ status: 500, body: { error: "Não foi possível salvar as alterações." } });
  });

  it("nenhum admin pode ser desativado — nem o próprio, nem outro (422, nada muda, login não é bloqueado)", async () => {
    f.state.profiles.set("admin-id", { id: "admin-id", tenant_id: TENANT, role: "admin", is_active: true, must_change_password: false, full_name: "Admin" });
    f.state.profiles.set("admin-2", { id: "admin-2", tenant_id: TENANT, role: "admin", is_active: true, must_change_password: false, full_name: "Admin 2" });

    for (const target of ["admin-id", "admin-2"]) {
      const res = await updateUser(f.repo, TENANT, "admin-id", target, { is_active: false });
      expect(res).toEqual({
        status: 422,
        body: { error: "Dados inválidos.", fields: { is_active: "Usuários administradores não podem ser desativados." } },
      });
      expect(f.state.profiles.get(target)!.is_active).toBe(true);
      expect(f.state.blocked.has(target)).toBe(false);
    }
  });

  it("um admin ainda pode ter o nome editado e a senha resetada", async () => {
    f.state.profiles.set("admin-2", { id: "admin-2", tenant_id: TENANT, role: "admin", is_active: true, must_change_password: false, full_name: "Admin 2" });
    expect((await updateUser(f.repo, TENANT, "admin-id", "admin-2", { full_name: "Novo nome" })).status).toBe(200);
    expect((await updateUser(f.repo, TENANT, "admin-id", "admin-2", { reset_password: "novaSenha123" })).status).toBe(200);
  });
});
