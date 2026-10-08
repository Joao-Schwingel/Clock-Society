import { test, expect, login } from "../test-helpers";

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
test("V-UI-08 — troca de senha: regras mínimas e mensagens em PT-BR na tela", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("vend-troca@t1.test");
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/auth\/trocar-senha$/);

  const nova = page.getByLabel("Nova senha", { exact: true });
  const confirmar = page.getByLabel("Confirmar nova senha");
  const trocar = page.getByRole("button", { name: "Trocar senha" });

  await nova.fill("curta");
  await confirmar.fill("curta");
  await trocar.click();
  await expect(page.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeVisible();

  await nova.fill("novaSenha123");
  await confirmar.fill("outraSenha123");
  await trocar.click();
  await expect(page.getByText("As senhas não conferem.")).toBeVisible();

  // igual à temporária
  await nova.fill("senha123");
  await confirmar.fill("senha123");
  await trocar.click();
  await expect(page.getByText("A nova senha precisa ser diferente da senha temporária.")).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/trocar-senha$/);
});
async function goToUsuarios(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("tab", { name: "Usuários" }).click();
  await expect(page.getByRole("row").filter({ hasText: "vend-a@t1.test" })).toBeVisible();
}

async function signInAs(page: import("@playwright/test").Page, email: string, password = "senha123") {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("V-UI-09 — admin cria vendedor com um registro novo; o vendedor entra e é levado à troca de senha", async ({
  page,
  browser,
}) => {
  await goToUsuarios(page);
  // outro inquilino não aparece
  await expect(page.getByRole("row").filter({ hasText: "outro@t2.test" })).toHaveCount(0);

  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome *", { exact: true }).fill("Usuário E2E");
  await dialog.getByLabel("E-mail *").fill("novo.e2e@t1.test");
  await dialog.getByLabel("Senha temporária *").fill("temporaria123");
  await dialog.getByText("Criar um novo registro de vendedor").click();
  await dialog.getByLabel("Nome do novo vendedor *").fill("Fulano E2E");
  await dialog.getByRole("button", { name: "Criar usuário" }).click();

  const row = page.getByRole("row").filter({ hasText: "novo.e2e@t1.test" });
  await expect(row).toContainText("Usuário E2E");
  await expect(row).toContainText("Fulano E2E (Clock Society)");
  await expect(row).toContainText("Troca de senha pendente");

  const context = await browser.newContext();
  const vendor = await context.newPage();
  await signInAs(vendor, "novo.e2e@t1.test", "temporaria123");
  await expect(vendor).toHaveURL(/\/auth\/trocar-senha$/);
  await context.close();
});

test("V-UI-09 — e-mail duplicado e vendedor que já tem login aparecem como erro no formulário", async ({ page }) => {
  await goToUsuarios(page);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome *", { exact: true }).fill("Repetido");
  await dialog.getByLabel("E-mail *").fill("vend-a@t1.test");
  await dialog.getByLabel("Senha temporária *").fill("temporaria123");
  await dialog.getByText("Site (Clock Society)").click();
  await dialog.getByRole("button", { name: "Criar usuário" }).click();
  await expect(dialog.getByText("Já existe um usuário com este e-mail.")).toBeVisible();
  // registros que já têm login nem aparecem como opção
  await expect(dialog.getByText("Ana (Clock Society)")).toHaveCount(0);
});

test("V-UI-09 — editar o nome, resetar a senha e desativar; o desativado não entra", async ({ page, browser }) => {
  await goToUsuarios(page);
  // Usuário criado pela própria API: os ids dos fixtures não são UUID, e a Admin API do Auth exige UUID.
  const created = await page.request.post("/api/users", {
    data: {
      full_name: "Vendedor Temporário",
      email: "temp.e2e@t1.test",
      password: "senhaInicial1",
      role: "vendedor",
      new_salesperson: { name: "Temp E2E", company_id: "comp-a" },
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  const row = () => page.getByRole("row").filter({ hasText: "temp.e2e@t1.test" });
  await expect(row()).toBeVisible();

  await row().getByRole("button", { name: "Editar" }).click();
  await page.getByRole("dialog").getByLabel("Nome *").fill("Nome Editado");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(row()).toContainText("Nome Editado");

  await row().getByRole("button", { name: "Resetar senha" }).click();
  await page.getByRole("dialog").getByLabel("Nova senha temporária *").fill("outraTemp123");
  await page.getByRole("dialog").getByRole("button", { name: "Redefinir" }).click();
  await expect(row()).toContainText("Troca de senha pendente");

  page.once("dialog", (d) => d.accept());
  await row().getByRole("button", { name: "Desativar" }).click();
  await expect(row()).toContainText("Inativo");

  const context = await browser.newContext();
  const vendor = await context.newPage();
  await signInAs(vendor, "temp.e2e@t1.test", "outraTemp123");
  await expect(vendor).toHaveURL(/\/auth\/login$/);
  await context.close();

  page.once("dialog", (d) => d.accept());
  await row().getByRole("button", { name: "Reativar" }).click();
  await expect(row()).toContainText("Ativo");
});

test("administradores não têm a ação Desativar; vendedores têm", async ({ page }) => {
  await goToUsuarios(page);
  for (const email of ["admin@t1.test", "admin2@t1.test"]) {
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Desativar" })).toHaveCount(0);
  }
  await expect(
    page.getByRole("row").filter({ hasText: "vend-a@t1.test" }).getByRole("button", { name: "Desativar" }),
  ).toBeVisible();
});

test("a API recusa desativar um admin, mesmo chamada direto", async ({ page }) => {
  await goToUsuarios(page);
  const res = await page.request.patch("/api/users/u-admin2", { data: { is_active: false } });
  expect(res.status()).toBe(422);
  expect((await res.json()).fields.is_active).toBe("Usuários administradores não podem ser desativados.");
});

test("V-UI-09 — vincular um registro sem vendas mostra aviso", async ({ page }) => {
  await goToUsuarios(page);
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Site (Clock Society)").click();
  await expect(dialog.getByRole("status")).toContainText("ainda não tem vendas registradas");
});

test("V-UI-09 — Configurações indica quais vendedores têm login", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Ana" })).toContainText("Com login");
  await expect(page.getByRole("row").filter({ hasText: "Diego" })).toContainText("Com login");
  await expect(page.getByRole("row").filter({ hasText: "Site" }).first()).not.toContainText("Com login");
});
