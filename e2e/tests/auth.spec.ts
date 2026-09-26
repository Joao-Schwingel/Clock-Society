import { test, expect, login } from "../test-helpers";

// C-AUTH-01
test("sem sessão, /dashboard redireciona para /auth/login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

// C-AUTH-03
test("/ leva a /auth/login sem sessão", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("/ leva a /dashboard com sessão", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

// C-AUTH-02
test("login válido leva a /dashboard", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Clock Society" })).toBeVisible();
});

test("login inválido mostra mensagem de erro e permanece na tela", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("admin@t1.test");
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Invalid login credentials")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login$/);
});

// C-AUTH-04
test('"Sair" encerra a sessão e volta ao login; a sessão não é reaberta ao navegar de volta', async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  // Tentar voltar direto para /dashboard depois do logout deve redirecionar de novo.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});
