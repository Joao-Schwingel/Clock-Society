import { describe, it } from "vitest";

// Fase 5 §5 "Telas" / Fase 6 fatia 6.6. Regras mínimas da troca de senha como função pura.
describe("regras de senha", () => {
  it.todo("V-UI-08 — senha com menos de 8 caracteres é recusada, com mensagem em PT-BR");
  it.todo("V-UI-08 — senha igual à temporária é recusada");
  it.todo("V-UI-08 — confirmação diferente da senha é recusada");
  it.todo("V-UI-08 — senha válida passa sem mensagens");
});
