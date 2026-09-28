import { test } from "../test-helpers";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §5, "Inicialização e inquilino").
// `test.fixme` com corpo vazio = `it.todo` do Playwright (ver admin-middleware.spec.ts).
// Viram testes na Fase 3 (fatias 3.4 e 3.6).

// Substitui C-NAV-04 (Fase 2 §6) — ver e2e/tests/nav.spec.ts.
test.fixme("A-BOOT-01 — admin sem empresas vê 'Nenhuma empresa disponível.' e a tela não quebra (N4)", () => {});
test.fixme("A-BOOT-01 — entrar sem empresas não envia nenhum insert em companies", () => {});

// Rede mockada: afirma o que a tela MANDA, não o que o RLS devolve.
test.fixme("A-BOOT-02 — a consulta de companies não envia mais o filtro user_id=eq.<id do usuário logado>", () => {});
