import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";

// Fase 5 §5 "API de usuários" / Fase 6 fatia 6.5. Autorização dos route handlers. O cliente do
// servidor e o repositório são MOCKADOS: nenhum teste abre conexão com banco (Fase 1 §1).
// As regras (V-API-01, 03, 04, 05) estão em lib/users/service.test.ts.

const { getClaims, repoFactory } = vi.hoisted(() => ({ getClaims: vi.fn(), repoFactory: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims } }),
}));
vi.mock("@/lib/users/supabase-repo", () => ({ createSupabaseUsersRepo: () => repoFactory() }));

function req(body?: unknown) {
  return new Request("http://localhost/api/users", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
}
const claims = (app_role: string) => ({ data: { claims: { sub: "u1", app_metadata: { app_role, tenant_id: "t1" } } }, error: null });
const ctx = { params: Promise.resolve({ id: "x" }) };

beforeEach(() => {
  getClaims.mockReset();
  repoFactory.mockReset();
});

describe("autorização (todos os endpoints)", () => {
  it("V-API-02 — sem sessão → 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    for (const res of [await GET(), await POST(req({})), await PATCH(req({}), ctx)]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Não autenticado." });
    }
    expect(repoFactory).not.toHaveBeenCalled();
  });

  it("V-API-02 — sessão de vendedor → 403", async () => {
    getClaims.mockResolvedValue(claims("vendedor"));
    for (const res of [await GET(), await POST(req({})), await PATCH(req({}), ctx)]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Acesso negado." });
    }
    expect(repoFactory).not.toHaveBeenCalled();
  });

  it("admin com corpo inválido → 422 (a validação roda antes de qualquer acesso ao banco)", async () => {
    getClaims.mockResolvedValue(claims("admin"));
    repoFactory.mockReturnValue({});
    const res = await POST(req({ email: "x" }));
    expect(res.status).toBe(422);
  });
});
