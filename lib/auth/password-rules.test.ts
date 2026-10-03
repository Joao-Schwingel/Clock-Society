import { describe, expect, it } from "vitest";
import { authPasswordErrorMessage, validatePasswordChange } from "./password-rules";

// Fase 5 §5 "Telas" / Fase 6 fatia 6.6. Regras mínimas da troca de senha, como função pura.
describe("regras de senha", () => {
  it("V-UI-08 — senha com menos de 8 caracteres é recusada, com mensagem em PT-BR", () => {
    expect(validatePasswordChange({ password: "1234567", confirm: "1234567" })).toEqual({
      password: "A senha precisa ter pelo menos 8 caracteres.",
    });
  });

  it("V-UI-08 — senha igual à atual (a temporária) é recusada pelo Auth, com mensagem em PT-BR", () => {
    expect(authPasswordErrorMessage("same_password")).toBe("A nova senha precisa ser diferente da senha temporária.");
    expect(authPasswordErrorMessage("weak_password")).toBe("Senha fraca. Use uma senha mais longa e menos previsível.");
    expect(authPasswordErrorMessage("qualquer_outro")).toBe("Não foi possível trocar a senha. Tente novamente.");
  });

  it("V-UI-08 — confirmação diferente da senha é recusada", () => {
    expect(validatePasswordChange({ password: "novaSenha123", confirm: "outraSenha123" })).toEqual({
      confirm: "As senhas não conferem.",
    });
  });

  it("V-UI-08 — senha válida passa sem mensagens", () => {
    expect(validatePasswordChange({ password: "novaSenha123", confirm: "novaSenha123" })).toEqual({});
  });
});
