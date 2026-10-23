import { test, expect, login, MOCK_URL } from "../test-helpers";

async function openConfiguracoes(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("button", { name: "Configurações" }).click();
}

// C-SET-01
test("lista as pessoas do inquilino, uma linha por pessoa (022)", async ({ page }) => {
  await openConfiguracoes(page);
  // 022: um cadastro por PESSOA, não por (pessoa, empresa). Site, Ana, Bruno, Carla, Diego e
  // Elis = 6 (não inclui o "Site" de comp-x, que é de outro inquilino).
  await expect(page.locator("tbody tr")).toHaveCount(6);
  // a Carla, que antes eram dois cadastros, agora é um só com as duas empresas na mesma linha
  const carla = page.getByRole("row").filter({ hasText: "Carla" });
  await expect(carla).toHaveCount(1);
  await expect(carla).toContainText("Clock Society");
  await expect(carla).toContainText("The Secret");
});

test("criar pessoa com acesso a duas empresas de uma vez (022)", async ({ page, request }) => {
  await openConfiguracoes(page);
  await page.getByRole("tab", { name: "Adicionar Vendedor" }).click();

  await page.getByLabel("Nome do Vendedor *").fill("Vendedor Novo");
  // sem nenhuma empresa marcada não dá para salvar: a pessoa ficaria invisível
  await expect(page.getByRole("button", { name: "Adicionar", exact: true })).toBeDisabled();

  await page.getByRole("checkbox", { name: "Clock Society" }).click();
  await page.getByRole("checkbox", { name: "The Secret" }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  const linha = page.getByRole("row").filter({ hasText: "Vendedor Novo" });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Clock Society");
  await expect(linha).toContainText("The Secret");

  // um cadastro só, com dois acessos
  const pessoas = await (await request.get(`${MOCK_URL}/rest/v1/salespersons?name=eq.Vendedor Novo`)).json();
  expect(pessoas).toHaveLength(1);
  const acessos = await (
    await request.get(`${MOCK_URL}/rest/v1/salesperson_companies?salesperson_id=eq.${pessoas[0].id}`)
  ).json();
  expect(acessos).toHaveLength(2);
  // o percentual não mora mais no cadastro: ele é digitado na venda
  expect(pessoas[0].commission_percentage).toBeUndefined();
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
