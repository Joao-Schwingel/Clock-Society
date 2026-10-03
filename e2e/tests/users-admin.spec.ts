import { test, expect } from "../test-helpers";

// Fase 5 §5 / Fase 6 fatias 6.5–6.7. `test.fixme` = `it.todo` do Playwright.

test("V-API-02 — /api/users sem sessão → 401", async ({ request }) => {
  const res = await request.get("/api/users");
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "Não autenticado." });

  const post = await request.post("/api/users", { data: {} });
  expect(post.status()).toBe(401);
});

test("V-API-02 — /api/users com sessão de vendedor → 403", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("vend-a@t1.test");
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(403|vendedor)/);

  // page.request usa os cookies da sessão do vendedor
  for (const res of [
    await page.request.get("/api/users"),
    await page.request.post("/api/users", { data: {} }),
    await page.request.patch("/api/users/u-vend-b", { data: { is_active: false } }),
  ]) {
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acesso negado." });
  }
});
test.fixme("V-UI-08 — troca de senha: regras mínimas e mensagens em PT-BR na tela", () => {});
test.fixme("V-UI-09 — admin lista, cria, edita, desativa e reseta a senha de usuários", () => {});
test.fixme("V-UI-09 — vincular um registro sem vendas mostra aviso", () => {});
test.fixme("V-UI-09 — Configurações indica quais vendedores têm login", () => {});
