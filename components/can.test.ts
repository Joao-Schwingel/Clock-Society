import { describe, it } from "vitest";

// Fase 2 (specs/release-2/fase-2-casos-de-teste-admin.md §5, "Permissões e navegação").
// Só `it.todo`: vira teste na Fase 3 (fatia 3.4), quando `components/can.tsx` existir.
// Arquivo `.ts` (e não `.tsx`) porque o vitest.config.ts só inclui `**/*.test.ts`; na Fase 3,
// renderizar com `react-dom/server` (sem DOM) ou ampliar o include para `.tsx`.

describe("<Can>", () => {
  it.todo("A-PERM-03 — mostra o conteúdo quando a sessão tem a permissão");
  it.todo("A-PERM-03 — mostra o fallback (ou nada) quando a sessão não tem a permissão");
});
