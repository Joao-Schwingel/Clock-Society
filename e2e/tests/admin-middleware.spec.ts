import { test, expect, MOCK_URL } from "../test-helpers";

// Fase 2 §5 "Middleware e rotas" / Fase 3 fatia 3.5.
//
// Os JWTs são FABRICADOS pelo mock server (e2e/mock-server/auth.mjs), com as claims
// app_metadata.app_role/tenant_id de e2e/fixtures/profiles.json — nunca um login real contra o
// Supabase Auth. Como no Supabase real, o getUser() do mock NÃO devolve essas claims (N10): se o
// middleware decidisse o papel por getUser(), o admin cairia em /403.

const PASSWORD = "senha123";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function expectForbidden(page: import("@playwright/test").Page) {
  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByText("Acesso negado")).toBeVisible();
  await expect(page.getByText("Seu usuário não tem permissão para acessar esta área.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
}

test("A-MW-01 — sem sessão, /dashboard redireciona para /auth/login (C-AUTH-01 repetido)", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("A-MW-02 — admin com token cujas claims trazem app_role = admin acessa /dashboard; a decisão vem das claims, não de getUser()", async ({
  page,
}) => {
  await signIn(page, "admin@t1.test");
  await page.waitForURL(/\/dashboard/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Clock Society" })).toBeVisible();
});

test("A-MW-03 — sem sessão, /auth/sign-up e /auth/sign-up-success redirecionam para /auth/login", async ({ page }) => {
  await page.goto("/auth/sign-up");
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/auth/sign-up-success");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("A-MW-04 — usuário sem perfil vai para /403, com mensagem em PT-BR e botão 'Sair'", async ({ page }) => {
  await signIn(page, "semperfil@t1.test");
  await expectForbidden(page);

  await page.goto("/dashboard");
  await expectForbidden(page);
});

// MUDANÇA (Fase 6, documentada em docs/fase-5/README.md): o vendedor ganhou a própria área, então
// vendedor-sem-vinculo não cai mais na /403 ao entrar (vê o estado vazio — V-UI-03). O caso
// "papel sem permissão para a área" continua valendo: ele não entra no /dashboard do admin.
test("A-MW-04 — perfil sem permissão para a área não entra no /dashboard do admin", async ({ page }) => {
  await signIn(page, "vendedor-sem-vinculo@t1.test");
  await expect(page).toHaveURL(/\/vendedor/);

  await page.goto("/dashboard?company=contracts");
  await expect(page).not.toHaveURL(/\/dashboard/);
});

test("A-MW-04 — 'Sair' na /403 encerra a sessão e volta ao login", async ({ page }) => {
  await signIn(page, "semperfil@t1.test");
  await expectForbidden(page);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("A-MW-05 — depois do login, o admin vai para /dashboard", async ({ page }) => {
  await signIn(page, "admin@t1.test");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("A-MW-06 — sessão com token sem as claims novas (emitido antes do hook) é renovada e segue para /dashboard, sem ficar presa em /403", async ({
  page,
  request,
}) => {
  const res = await request.post(`${MOCK_URL}/__test__/legacy-tokens`);
  expect(res.ok()).toBeTruthy();

  await signIn(page, "admin@t1.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Clock Society" })).toBeVisible();
});
