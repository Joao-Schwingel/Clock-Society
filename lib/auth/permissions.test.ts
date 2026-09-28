import { describe, it } from "vitest";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §5, "Permissões e navegação").
// Só `it.todo`: cada caso vira teste de verdade no ciclo RED→GREEN da Fase 3 (fatia 3.4),
// quando `lib/auth/permissions.ts` existir. Catálogo proposto na §3.1 da spec.
//
// Nenhum destes testes abre conexão com banco (Fase 1 §1): o A-PERM-01 compara o catálogo do
// front com o SQL de seed de `role_permissions` lido como TEXTO (fs.readFileSync + parse), nunca
// executando o SQL.

describe("catálogo de permissões", () => {
  it.todo(
    "A-PERM-01 — o catálogo do front é igual às linhas de role_permissions do SQL de seed (parse estático do arquivo da migration 013, sem conexão)",
  );

  it.todo("A-PERM-02 — o papel admin tem todas as permissões do catálogo");
});
