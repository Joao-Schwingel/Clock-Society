import { beforeEach, describe, expect, it } from "vitest";
import { createUser, updateUser } from "./service";
import type { UsersRepo } from "./repo";

// Fase 5 §5 "API de usuários" / Fase 6 fatia 6.5. Regras do serviço contra um repositório em
// memória — nenhum teste abre conexão com banco (Fase 1 §1).

const TENANT = "t1";

function fakeRepo() {
  const state = {
    // e-mail → id do dono: a edição precisa saber se o e-mail é de OUTRO login ou do próprio
    emails: new Map<string, string>([
      ["ja@existe.com", "p-ja"],
      ["bruno@loja.com", "p-bruno"],
    ]),
    // 022: a pessoa é um cadastro só, com acesso a N empresas
    salespersons: [
      { id: "sp-ana", tenantId: TENANT, companyIds: ["comp-a", "comp-b"], profileId: null as string | null },
      { id: "sp-bruno", tenantId: TENANT, companyIds: ["comp-a"], profileId: "p-bruno" as string | null },
      { id: "sp-outro", tenantId: "t2", companyIds: ["comp-x"], profileId: null as string | null },
    ],
    companies: [
      { id: "comp-a", tenantId: TENANT },
      { id: "comp-b", tenantId: TENANT },
    ],
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
    async emailExists(email, exceptUserId) {
      const dono = state.emails.get(email.toLowerCase());
      return dono !== undefined && dono !== exceptUserId;
    },
    async salespersonHasLogin(id) { return Boolean(state.salespersons.find((s) => s.id === id)?.profileId); },
    async salespersonInTenant(id, tenantId) { return state.salespersons.some((s) => s.id === id && s.tenantId === tenantId); },
    async companiesInTenant(companyIds, tenantId) { return state.companies.filter((c) => companyIds.includes(c.id) && c.tenantId === tenantId).map((c) => c.id); },
    async createSalesperson({ name, companyIds, tenantId }) {
      const id = `sp-new-${++seq}`;
      state.salespersons.push({ id, tenantId, companyIds, profileId: null });
      state.calls.push(`createSalesperson:${name}`);
      return id;
    },
    async createAuthUser({ email }) {
      const id = `p-new-${++seq}`;
      state.emails.set(email.toLowerCase(), id);
      // Cria SÓ o login, como o GoTrue: o app_metadata é aplicado num UPDATE posterior, então o
      // gatilho on_auth_user_created não tinha criado o perfil aqui. Quem cria é ensureProfile().
      state.calls.push("createAuthUser");
      return id;
    },
    async ensureProfile({ id, tenantId, role, fullName, mustChangePassword }) {
      state.profiles.set(id, {
        id,
        tenant_id: tenantId,
        role,
        is_active: true,
        must_change_password: mustChangePassword,
        full_name: fullName,
      });
      state.calls.push("ensureProfile");
    },
    async deleteAuthUser(id) { state.profiles.delete(id); state.calls.push(`deleteAuthUser:${id}`); },
    async updateProfile(id, patch) { Object.assign(state.profiles.get(id)!, patch); },
    async linkSalesperson(profileId, salespersonId) {
      if (salespersonId === "sp-falha") throw new Error("falha simulada");
      // espelha a FK de salespersons.profile_id: sem perfil, o update é recusado (23503). Era
      // assim que o fluxo quebrava antes da 021 — o fake não reproduzia e os testes passavam
      // com o produto quebrado.
      if (!state.profiles.has(profileId)) {
        throw new Error(`violates foreign key constraint: perfil ${profileId} não existe`);
      }
      const pessoa = state.salespersons.find((s) => s.id === salespersonId);
      if (!pessoa) throw new Error("vendedor inexistente");
      // espelha o índice único de profile_id: uma pessoa, um login
      if (pessoa.profileId && pessoa.profileId !== profileId) throw new Error("vendedor já vinculado");
      pessoa.profileId = profileId;
    },
    async setLoginBlocked(id, blocked) { if (blocked) state.blocked.add(id); else state.blocked.delete(id); },
    async setPassword(id, password) { state.passwords.set(id, password); },
    async setEmail(id, email) {
      // o e-mail antigo fica livre, como no Auth
      for (const [atual, dono] of state.emails) if (dono === id) state.emails.delete(atual);
      state.emails.set(email.toLowerCase(), id);
    },
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
  salesperson_id: "sp-ana",
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
    expect(f.state.salespersons.find((sp) => sp.id === "sp-ana")?.profileId).toBe(id);
  });

  it("V-API-01 — cria também um registro novo em salespersons e vincula", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: undefined,
      new_salesperson: { name: "Carla", company_ids: ["comp-a"] },
    });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(f.state.calls).toContain("createSalesperson:Carla");
    expect(f.state.salespersons.find((sp) => sp.id.startsWith("sp-new-"))?.profileId).toBe(id);
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
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-bruno" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Este vendedor já está vinculado a outro login." });
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("registro de vendedor de outro inquilino → 422", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-outro" });
    expect(res.status).toBe(422);
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("vendedor sem nenhum vínculo é recusado (422)", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: undefined });
    expect(res.status).toBe(422);
    expect((res.body as { fields: Record<string, string> }).fields.salesperson_id).toBe("Escolha um vendedor ou cadastre um novo.");
  });

  it("cria o perfil explicitamente, antes de vincular — não espera o gatilho", async () => {
    // Regressão: o GoTrue aplica o app_metadata num UPDATE depois do INSERT, então o gatilho
    // on_auth_user_created não tinha criado o perfil a tempo e o vínculo quebrava na FK (23503),
    // derrubando a criação de qualquer usuário. docs/fase-6/vinculo-login-vendedor.md §3.
    const res = await createUser(f.repo, TENANT, valid);
    expect(res.status).toBe(201);
    expect(f.state.calls.indexOf("ensureProfile")).toBeGreaterThan(f.state.calls.indexOf("createAuthUser"));
    const perfil = f.state.profiles.get((res.body as { id: string }).id);
    expect(perfil).toMatchObject({ tenant_id: TENANT, role: "vendedor", must_change_password: true });
  });

  // ── Uma pessoa, N empresas, UM login (022) ────────────────────────────────────────────────
  // O cadastro é da PESSOA; as empresas em que ela atende são acessos. O login aponta para a
  // pessoa, 1:1 — garantido no banco pelo índice único de salespersons.profile_id.

  it("vincula uma pessoa que atende duas empresas: um login, um cadastro", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-ana" });
    expect(res.status).toBe(201);
    const pessoa = f.state.salespersons.find((sp) => sp.id === "sp-ana");
    expect(pessoa?.profileId).toBe((res.body as { id: string }).id);
    expect(pessoa?.companyIds).toEqual(["comp-a", "comp-b"]);
  });

  it("pessoa de outro inquilino → 422, sem criar login", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-outro" });
    expect(res.status).toBe(422);
    expect(f.state.calls).not.toContain("createAuthUser");
    expect(f.state.salespersons.find((sp) => sp.id === "sp-outro")?.profileId).toBeNull();
  });

  it("pessoa que já tem login → 409, sem criar nada", async () => {
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-bruno" });
    expect(res.status).toBe(409);
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("cadastra a pessoa nova já com acesso a várias empresas", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: undefined,
      new_salesperson: { name: "Carla", company_ids: ["comp-a", "comp-b"] },
    });
    expect(res.status).toBe(201);
    const nova = f.state.salespersons.find((sp) => sp.id.startsWith("sp-new-"));
    expect(nova?.companyIds).toEqual(["comp-a", "comp-b"]);
    expect(nova?.profileId).toBe((res.body as { id: string }).id);
  });

  it("empresas repetidas no cadastro novo viram um acesso só", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: undefined,
      new_salesperson: { name: "Carla", company_ids: ["comp-a", "comp-a"] },
    });
    expect(res.status).toBe(201);
    expect(f.state.salespersons.find((sp) => sp.id.startsWith("sp-new-"))?.companyIds).toEqual(["comp-a"]);
  });

  it("escolher uma pessoa E cadastrar outra ao mesmo tempo → 422", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: "sp-ana",
      new_salesperson: { name: "Carla", company_ids: ["comp-a"] },
    });
    expect(res.status).toBe(422);
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("empresa de outro inquilino no cadastro novo → 422", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: undefined,
      new_salesperson: { name: "Carla", company_ids: ["comp-a", "comp-x"] },
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ fields: { new_salesperson: "Empresa inválida." } });
    expect(f.state.calls).not.toContain("createAuthUser");
  });

  it("cadastro novo sem nenhuma empresa → 422", async () => {
    const res = await createUser(f.repo, TENANT, {
      ...valid,
      salesperson_id: undefined,
      new_salesperson: { name: "Carla", company_ids: [] },
    });
    expect(res.status).toBe(422);
  });

  it("falha depois de criar o login → desfaz o login (compensação) e devolve 500", async () => {
    f.state.salespersons.push({ id: "sp-falha", tenantId: TENANT, companyIds: ["comp-a"], profileId: null });
    const res = await createUser(f.repo, TENANT, { ...valid, salesperson_id: "sp-falha" });
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

  it("V-API-05 — trocar o e-mail grava o novo no Auth e libera o antigo", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { email: "bruno.novo@loja.com" });
    expect(res.status).toBe(200);
    expect(f.state.emails.get("bruno.novo@loja.com")).toBe("p-bruno");
    expect(f.state.emails.has("bruno@loja.com")).toBe(false);
  });

  it("V-API-05 — e-mail já usado por outro login → 409 e o e-mail atual não muda", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { email: "JA@existe.com" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Já existe um usuário com este e-mail." });
    expect(f.state.emails.get("bruno@loja.com")).toBe("p-bruno");
    expect(f.state.emails.get("ja@existe.com")).toBe("p-ja");
  });

  it("salvar o próprio e-mail não é conflito, mesmo com espaços e maiúsculas", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { email: "  BRUNO@Loja.com " });
    expect(res.status).toBe(200);
    expect(f.state.emails.get("bruno@loja.com")).toBe("p-bruno");
  });

  it("e-mail inválido → 422 com a mensagem em PT-BR, sem tocar no Auth", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { email: "nao-e-email" });
    expect(res.status).toBe(422);
    expect((res.body as { fields: Record<string, string> }).fields.email).toBe("E-mail inválido.");
    expect(f.state.emails.get("bruno@loja.com")).toBe("p-bruno");
  });

  it("trocar o e-mail não mexe na senha nem obriga a trocá-la", async () => {
    await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { email: "bruno.novo@loja.com" });
    expect(f.state.passwords.has("p-bruno")).toBe(false);
    expect(f.state.profiles.get("p-bruno")!.must_change_password).toBe(false);
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

  // LACUNA conhecida: o contrato de edição não mexe em vínculo. Com a 022 isso dói menos — as
  // empresas da pessoa se editam em Configurações → Vendedores, sem passar por aqui —, mas trocar
  // o login de uma pessoa ainda exige banco.
  it("a edição de usuário não mexe no vínculo: o campo é ignorado e vira 422", async () => {
    const res = await updateUser(f.repo, TENANT, "admin-id", "p-bruno", { salesperson_id: "sp-ana" });
    expect(res.status).toBe(422);
    expect(f.state.salespersons.find((sp) => sp.id === "sp-ana")?.profileId).toBeNull();
  });

  it("um admin ainda pode ter o nome, o e-mail e a senha editados", async () => {
    f.state.profiles.set("admin-2", { id: "admin-2", tenant_id: TENANT, role: "admin", is_active: true, must_change_password: false, full_name: "Admin 2" });
    expect((await updateUser(f.repo, TENANT, "admin-id", "admin-2", { full_name: "Novo nome" })).status).toBe(200);
    expect((await updateUser(f.repo, TENANT, "admin-id", "admin-2", { email: "admin2@loja.com" })).status).toBe(200);
    expect((await updateUser(f.repo, TENANT, "admin-id", "admin-2", { reset_password: "novaSenha123" })).status).toBe(200);
    expect(f.state.emails.get("admin2@loja.com")).toBe("admin-2");
  });
});
