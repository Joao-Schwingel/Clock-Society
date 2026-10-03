import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTES, decideRoute, homeForRole } from "./route-guard";

// Fase 2 §3.4 e §5 "Middleware e rotas" / Fase 3 fatia 3.5. A tabela de decisão do middleware é
// uma função pura; lib/supabase/middleware.ts só aplica o resultado. O fluxo completo (cookies,
// renovação, /403) está em e2e/tests/admin-middleware.spec.ts.

const admin = { appRole: "admin", tenantId: "t1" };
const noClaims = { appRole: null, tenantId: null };

describe("rotas públicas", () => {
  // Substitui C-AUTH-05 (Fase 2 §6).
  it("A-MW-03 — as rotas públicas são só /, /auth/login e /auth/error", () => {
    expect([...PUBLIC_ROUTES].sort()).toEqual(["/", "/auth/error", "/auth/login"]);
    expect(decideRoute({ pathname: "/auth/sign-up", session: null, refreshed: false })).toEqual({
      action: "redirect",
      to: "/auth/login",
    });
    expect(decideRoute({ pathname: "/auth/sign-up-success", session: null, refreshed: false })).toEqual({
      action: "redirect",
      to: "/auth/login",
    });
  });
});

describe("tabela de decisão (§3.4)", () => {
  it("sem sessão, rota pública → segue", () => {
    for (const pathname of ["/", "/auth/login", "/auth/error"]) {
      expect(decideRoute({ pathname, session: null, refreshed: false })).toEqual({ action: "next" });
    }
  });

  it("A-MW-01 — sem sessão, rota não pública → /auth/login", () => {
    for (const pathname of ["/dashboard", "/403", "/qualquer"]) {
      expect(decideRoute({ pathname, session: null, refreshed: false })).toEqual({
        action: "redirect",
        to: "/auth/login",
      });
    }
  });

  it("A-MW-02 — sessão com app_role = admin nas claims → segue", () => {
    expect(decideRoute({ pathname: "/dashboard", session: admin, refreshed: false })).toEqual({ action: "next" });
  });

  it("A-MW-04 — sessão sem perfil (sem claims mesmo após renovar) → /403", () => {
    expect(decideRoute({ pathname: "/dashboard", session: noClaims, refreshed: true })).toEqual({
      action: "redirect",
      to: "/403",
    });
  });

  it("A-MW-04 — sessão com papel sem permissão para a área → /403", () => {
    const vendedor = { appRole: "vendedor", tenantId: "t1" };
    expect(decideRoute({ pathname: "/dashboard", session: vendedor, refreshed: false })).toEqual({
      action: "redirect",
      to: "/403",
    });
    expect(decideRoute({ pathname: "/dashboard/x", session: { appRole: "gerente", tenantId: "t1" }, refreshed: false }))
      .toEqual({ action: "redirect", to: "/403" });
  });

  it("A-MW-04 — a /403 é acessível para quem não tem papel válido (sem laço de redirecionamento)", () => {
    expect(decideRoute({ pathname: "/403", session: noClaims, refreshed: true })).toEqual({ action: "next" });
    const vendedor = { appRole: "vendedor", tenantId: "t1" };
    expect(decideRoute({ pathname: "/403", session: vendedor, refreshed: false })).toEqual({ action: "next" });
  });

  it("A-MW-06 — na /403, sessão sem claims renova uma vez; se ganhar papel válido, vai para a home dele", () => {
    expect(decideRoute({ pathname: "/403", session: noClaims, refreshed: false })).toEqual({ action: "refresh" });
    expect(decideRoute({ pathname: "/403", session: admin, refreshed: true })).toEqual({
      action: "redirect",
      to: "/dashboard",
    });
  });

  it("A-MW-06 — sessão sem claim de papel → renova uma vez; ainda sem claim → /403", () => {
    expect(decideRoute({ pathname: "/dashboard", session: noClaims, refreshed: false })).toEqual({ action: "refresh" });
    expect(decideRoute({ pathname: "/dashboard", session: noClaims, refreshed: true })).toEqual({
      action: "redirect",
      to: "/403",
    });
    expect(decideRoute({ pathname: "/dashboard", session: admin, refreshed: true })).toEqual({ action: "next" });
  });
});

describe("rotas de API", () => {
  it("V-API-02 — /api/* não é redirecionada: a própria API responde 401/403 (sem página de login no meio)", () => {
    for (const session of [null, noClaims, { appRole: "vendedor", tenantId: "t1" }]) {
      expect(decideRoute({ pathname: "/api/users", session, refreshed: false })).toEqual({ action: "next" });
      expect(decideRoute({ pathname: "/api/users/abc", session, refreshed: true })).toEqual({ action: "next" });
    }
  });
});

describe("destino pós-login", () => {
  it("A-MW-05 — o destino por papel vem de uma única função; admin → /dashboard", () => {
    expect(homeForRole("admin")).toBe("/dashboard");
    expect(homeForRole(null)).toBe("/403");
    expect(homeForRole("vendedor")).toBe("/403");
  });
});

// Fase 5 §5 "Middleware e rotas" / Fase 6 fatias 6.6 e 6.8.
describe("vendedor (Fase 6)", () => {
  it.todo("V-MW-01 — homeForRole('vendedor') leva à área do vendedor (decisão 3.8: /vendedor), e não mais a /403");
  it.todo("V-MW-01 — vendedor com sessão em /vendedor → segue; admin em /vendedor → /403");
  it("V-MW-02 — claim must_change_password = true → qualquer rota leva a /auth/trocar-senha", () => {
    const pendente = { appRole: "admin", tenantId: "t1", mustChangePassword: true };
    for (const pathname of ["/dashboard", "/vendedor", "/403", "/qualquer"]) {
      expect(decideRoute({ pathname, session: pendente, refreshed: false })).toEqual({
        action: "redirect",
        to: "/auth/trocar-senha",
      });
    }
    expect(decideRoute({ pathname: "/auth/trocar-senha", session: pendente, refreshed: false })).toEqual({ action: "next" });
    // a API responde sozinha (a própria troca é uma rota de API)
    expect(decideRoute({ pathname: "/api/me/password", session: pendente, refreshed: false })).toEqual({ action: "next" });
  });

  it("V-MW-02 — sem must_change_password, /auth/trocar-senha não prende o usuário (segue para a home do papel)", () => {
    expect(decideRoute({ pathname: "/auth/trocar-senha", session: admin, refreshed: false })).toEqual({
      action: "redirect",
      to: "/dashboard",
    });
  });

  it("V-MW-02 — /auth/trocar-senha sem sessão → /auth/login", () => {
    expect(decideRoute({ pathname: "/auth/trocar-senha", session: null, refreshed: false })).toEqual({
      action: "redirect",
      to: "/auth/login",
    });
  });
  it.todo("V-MW-03 — vendedor em /dashboard (área do admin) → /403");
  it("V-MW-04 — perfil desativado com sessão aberta: o token renovado vem sem claims → /403 (decisão 3.7)", () => {
    expect(decideRoute({ pathname: "/dashboard", session: { appRole: null, tenantId: null }, refreshed: true })).toEqual({
      action: "redirect",
      to: "/403",
    });
  });
});
