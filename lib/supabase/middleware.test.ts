import { describe, it } from "vitest";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §3.4 e §5, "Middleware e rotas").
// Só `it.todo`: viram testes na Fase 3 (fatia 3.5). A tabela de decisão do middleware (§3.4) deve
// sair como função pura (sessão + claims + rota → resultado), para ser testada aqui sem Next.js
// nem rede. Os casos que precisam do fluxo completo (cookies, renovação de sessão, página /403)
// estão em e2e/tests/admin-middleware.spec.ts.

describe("rotas públicas", () => {
  // Substitui C-AUTH-05 (Fase 2 §6).
  it.todo(
    "A-MW-03 — as rotas públicas são só /, /auth/login e /auth/error; /auth/sign-up e /auth/sign-up-success deixam de ser públicas",
  );
});

describe("tabela de decisão (§3.4)", () => {
  it.todo("A-MW-01 — sem sessão, rota não pública → /auth/login");
  it.todo("A-MW-02 — sessão com app_role = admin nas claims do token → segue");
  it.todo("A-MW-04 — sessão de usuário sem perfil (claims sem app_role e sem perfil) → /403");
  it.todo("A-MW-04 — sessão com papel sem permissão para a área → /403");
  it.todo(
    "A-MW-06 — sessão sem claim de papel → pede uma renovação; se a renovada trouxer as claims, segue; se continuar sem, → /403",
  );
});

describe("destino pós-login", () => {
  it.todo("A-MW-05 — o destino por papel vem de uma única função; admin → /dashboard");
});
