import { test, expect, login, MOCK_URL } from "../test-helpers";

async function openConfiguracoes(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("button", { name: "Configurações" }).click();
}

// C-SET-01
test("lista os vendedores de todas as empresas do usuário", async ({ page }) => {
  await openConfiguracoes(page);
  // 6 em Clock Society + 2 em The Secret + 1 em Morfeus = 9 (não inclui o
  // vendedor "Site" de comp-x, que é de outro usuário/inquilino)
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await expect(page.getByRole("row").filter({ hasText: "Carla" })).toHaveCount(2); // A e B
});

test("criar vendedor grava sempre 0% de comissão (achado 10)", async ({ page, request }) => {
  await openConfiguracoes(page);
  await page.getByRole("tab", { name: "Adicionar Vendedor" }).click();

  await page.getByLabel("Nome do Vendedor *").fill("Vendedor Novo");
  await page.getByLabel("Empresa *").click();
  await page.getByRole("option", { name: "Clock Society" }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(page.getByRole("row").filter({ hasText: "Vendedor Novo" })).toBeVisible();

  const check = await request.get(`${MOCK_URL}/rest/v1/salespersons?name=eq.Vendedor Novo`);
  const [sp] = await check.json();
  expect(sp.commission_percentage).toBe(0);
});

test("editar vendedor e ativar/inativar", async ({ page, request }) => {
  await openConfiguracoes(page);
  await page.getByRole("row").filter({ hasText: "Diego" }).getByRole("button").first().click();

  await expect(page.getByRole("tab", { name: "Editar Vendedor" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByLabel("Status *").click();
  await page.getByRole("option", { name: "Inativo", exact: true }).click();
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();

  await expect(page.getByRole("row").filter({ hasText: "Diego" })).toContainText("Inativo");

  const check = await request.get(`${MOCK_URL}/rest/v1/salespersons?name=eq.Diego`);
  const [sp] = await check.json();
  expect(sp.is_active).toBe(false);
});

test("excluir vendedor pede confirmação (dialog nativo)", async ({ page }) => {
  await openConfiguracoes(page);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Diego" })
    .getByRole("button")
    .nth(1)
    .click();

  await expect(page.getByRole("row").filter({ hasText: "Diego" })).toHaveCount(0);
});
