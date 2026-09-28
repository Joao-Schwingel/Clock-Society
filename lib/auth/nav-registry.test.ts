import { describe, it } from "vitest";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §5, "Permissões e navegação").
// Só `it.todo`: viram testes na Fase 3 (fatia 3.4), quando `lib/auth/nav-registry.ts` existir.
// O bloqueio por aba (§3.5, N11) é do registro; a proteção real continua sendo o RLS.

describe("nav-registry", () => {
  it.todo(
    "A-PERM-04 — para o admin, gera exatamente as abas de hoje e na mesma ordem: empresas por code + Contratos; subabas Dashboard, Vendas, Estoque, Custos (C-NAV-01/02 seguem verdes sem alteração)",
  );

  it.todo("A-PERM-05 — papel (fictício) sem a permissão da aba não recebe a aba na navegação");
  it.todo(
    "A-PERM-05 — ?tab= apontando para aba não permitida resolve para 'acesso negado', e não para a aba (papel fictício)",
  );
  it.todo(
    "A-PERM-05 — ?company= apontando para aba não permitida (ex.: Contratos) resolve para 'acesso negado' (papel fictício)",
  );

  it.todo("A-PERM-06 — o botão 'Configurações' só aparece com salespersons.manage");
});
