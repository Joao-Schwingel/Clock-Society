import { test } from "../test-helpers";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §5, "Middleware e rotas").
//
// O Playwright não tem `it.todo`; `test.fixme` com corpo vazio é o equivalente: o caso aparece
// como "skipped" no relatório e nunca roda. Cada um vira teste de verdade no ciclo RED→GREEN da
// Fase 3 (fatia 3.5).
//
// Os JWTs de A-MW-02/06 são FABRICADOS pelo mock server (e2e/mock-server/auth.mjs), com as claims
// app_metadata.app_role/tenant_id dos fixtures (e2e/fixtures/profiles.json) — nunca um login real
// contra o Supabase Auth. Com HS256, `auth.getClaims()` do supabase-js 2.85 cai em `getUser()`
// para validar o token, o que o mock já responde (ver docs/fase-2/README.md, decisão 3.3).

test.fixme("A-MW-01 — sem sessão, /dashboard redireciona para /auth/login (C-AUTH-01 repetido)", () => {});

test.fixme(
  "A-MW-02 — admin com token cujas claims trazem app_role = admin acessa /dashboard; a decisão vem das claims, não de getUser()",
  () => {},
);

test.fixme("A-MW-03 — sem sessão, /auth/sign-up e /auth/sign-up-success redirecionam para /auth/login", () => {});

test.fixme("A-MW-04 — usuário sem perfil vai para /403, com mensagem em PT-BR e botão 'Sair'", () => {});
test.fixme("A-MW-04 — perfil sem permissão para a área vai para /403, com mensagem em PT-BR e botão 'Sair'", () => {});
test.fixme("A-MW-04 — 'Sair' na /403 encerra a sessão e volta ao login", () => {});

test.fixme("A-MW-05 — depois do login, o admin vai para /dashboard", () => {});

test.fixme(
  "A-MW-06 — sessão com token sem as claims novas (emitido antes do hook) é renovada e segue para /dashboard, sem ficar presa em /403",
  () => {},
);
