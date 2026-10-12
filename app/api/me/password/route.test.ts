import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// Fase 6, fatia 6.6 (decisão 3.6): troca de senha numa rota de servidor, que limpa a marca
// must_change_password e renova a sessão. Clientes MOCKADOS: nenhum teste abre conexão com banco.

const m = vi.hoisted(() => ({
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
  profileUpdates: [] as Array<{ patch: Record<string, unknown>; id: string }>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: m.getClaims, updateUser: m.updateUser, refreshSession: m.refreshSession },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          m.profileUpdates.push({ patch, id });
          return { error: null };
        },
      }),
    }),
  }),
}));

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/me/password", { method: "POST", body: JSON.stringify(body) }));
const session = (app_role = "vendedor") => ({
  data: { claims: { sub: "u-vend", app_metadata: { app_role, tenant_id: "t1", must_change_password: true } } },
  error: null,
});

beforeEach(() => {
  m.getClaims.mockReset();
  m.updateUser.mockReset();
  m.refreshSession.mockReset();
  m.profileUpdates.length = 0;
});

describe("POST /api/me/password", () => {
  it("sem sessão → 401", async () => {
    m.getClaims.mockResolvedValue({ data: null, error: null });
    const res = await post({ password: "novaSenha123", confirm: "novaSenha123" });
    expect(res.status).toBe(401);
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("V-UI-08 — regras mínimas → 422 com a mensagem do campo, sem chamar o Auth", async () => {
    m.getClaims.mockResolvedValue(session());
    const res = await post({ password: "curta", confirm: "curta" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Dados inválidos.",
      fields: { password: "A senha precisa ter pelo menos 8 caracteres." },
    });
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("V-UI-08 — senha igual à temporária → 422 em PT-BR, e a marca continua", async () => {
    m.getClaims.mockResolvedValue(session());
    m.updateUser.mockResolvedValue({ error: { code: "same_password", message: "x" } });
    const res = await post({ password: "temporaria123", confirm: "temporaria123" });
    expect(res.status).toBe(422);
    expect((await res.json()).fields.password).toBe("A nova senha precisa ser diferente da senha temporária.");
    expect(m.profileUpdates).toEqual([]);
  });

  it("V-MW-02 — sucesso: troca a senha, limpa a marca do próprio perfil, renova a sessão e indica a home do papel", async () => {
    m.getClaims.mockResolvedValue(session("admin"));
    m.updateUser.mockResolvedValue({ error: null });
    m.refreshSession.mockResolvedValue({ data: {}, error: null });
    const res = await post({ password: "novaSenha123", confirm: "novaSenha123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirectTo: "/dashboard" });
    expect(m.updateUser).toHaveBeenCalledWith({ password: "novaSenha123" });
    expect(m.profileUpdates).toHaveLength(1);
    expect(m.profileUpdates[0].id).toBe("u-vend");
    expect(m.profileUpdates[0].patch.must_change_password).toBe(false);
    expect(m.refreshSession).toHaveBeenCalled();
  });
});
