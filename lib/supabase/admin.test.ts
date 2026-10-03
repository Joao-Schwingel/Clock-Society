import { describe, it } from "vitest";

// Fase 5 §5 / Fase 6 fatia 6.5. Sem servidor e sem banco: lê o output do `next build` como texto.
describe("chave service_role", () => {
  it.todo(
    "V-API-06 — nenhum arquivo em .next/static contém a SUPABASE_SERVICE_ROLE_KEY (grep no output do build; roda no CI depois do build)",
  );
  it.todo("V-API-06 — lib/supabase/admin.ts tem `import \"server-only\"`, então importá-lo num Client Component quebra o build");
});
