import { test, expect } from "../test-helpers";

// Fase 5 §5 "Middleware e rotas" / Fase 6 fatias 6.6 e 6.8.
// `test.fixme` com corpo vazio = `it.todo` do Playwright. Logins de e2e/fixtures/users.json (vend-*).

test.fixme("V-MW-01 — vend-a@t1 entra e cai na área do vendedor", () => {});
async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("V-MW-02 — vend-troca@t1 é levado à troca de senha em qualquer rota, sem escapatória por URL", async ({ page }) => {
  await signIn(page, "vend-troca@t1.test");
  await expect(page).toHaveURL(/\/auth\/trocar-senha$/);

  for (const path of ["/dashboard", "/403", "/dashboard?company=contracts"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/trocar-senha$/);
  }
});

test("V-MW-02 — depois de trocar a senha, a troca deixa de ser exigida", async ({ page }) => {
  await signIn(page, "vend-troca@t1.test");
  await expect(page).toHaveURL(/\/auth\/trocar-senha$/);

  await page.getByLabel("Nova senha", { exact: true }).fill("novaSenha123");
  await page.getByLabel("Confirmar nova senha").fill("novaSenha123");
  await page.getByRole("button", { name: "Trocar senha" }).click();

  await expect(page).not.toHaveURL(/trocar-senha/);
  // A página de troca não prende mais (o token renovado veio sem a marca)
  await page.goto("/auth/trocar-senha");
  await expect(page).not.toHaveURL(/trocar-senha/);
  // A área do vendedor só existe na fatia 6.8; até lá a home do vendedor é a /403.
});
test.fixme("V-MW-03 — vendedor em /dashboard, ?tab=custos-fixos, ?company=contracts ou Usuários vê acesso negado", () => {});
test("V-MW-04 — vend-inativo@t1 não consegue entrar", async ({ page }) => {
  await signIn(page, "vend-inativo@t1.test");
  await expect(page.getByText("Usuário desativado. Fale com o administrador.")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});
