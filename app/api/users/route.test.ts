import { describe, it } from "vitest";

// Fase 5 §5 "API de usuários" / Fase 6 fatia 6.5. Só `it.todo`: viram testes quando
// app/api/users/route.ts existir. Os route handlers são testados com o cliente de serviço
// (lib/supabase/admin.ts) MOCKADO — nenhum teste abre conexão com banco (Fase 1 §1).
// Contrato proposto: decisão 3.5 (issue #13).

describe("POST /api/users", () => {
  it.todo(
    "V-API-01 — admin cria vendedor com nome, e-mail, senha temporária, papel e vínculos (registro existente ou novo em salespersons); o perfil nasce com must_change_password",
  );
  it.todo("V-API-03 — e-mail duplicado → 409, com mensagem em PT-BR");
  it.todo("V-API-03 — payload inválido (schema zod) → 422, com as mensagens de campo em PT-BR");
  it.todo("V-API-04 — vincular registro de vendedor que já tem login → erro de validação antes de chamar o banco");
});

describe("autorização (todos os endpoints)", () => {
  it.todo("V-API-02 — sem sessão → 401");
  it.todo("V-API-02 — sessão de vendedor → 403");
});

describe("PATCH /api/users/[id]", () => {
  it.todo("V-API-05 — desativar: is_active = false e login bloqueado no Auth (ban_duration, decisão 3.7)");
  it.todo("V-API-05 — reativar: is_active = true e ban removido");
  it.todo("V-API-05 — resetar a senha reativa must_change_password");
});
