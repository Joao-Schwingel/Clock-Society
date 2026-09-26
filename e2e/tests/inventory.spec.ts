import { test, expect, login, formatBRL, cardByTitle } from "../test-helpers";
import expected from "../fixtures/expected-numbers.json";

async function goToEstoque(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("tab", { name: "Estoque" }).click();
  await expect(page).toHaveURL(/tab=estoque/);
}

// C-INV-01
test("cartões de estoque batem com a tabela esperada", async ({ page }) => {
  await goToEstoque(page);
  const oracle = expected.companies.A.inventory;

  await expect(cardByTitle(page, "Valor Total")).toContainText(`R$ ${formatBRL(oracle.totalValue)}`);
  await expect(cardByTitle(page, "Total de Produtos")).toContainText(String(oracle.totalProducts));
  await expect(cardByTitle(page, "Quantidade Total")).toContainText(String(oracle.totalQuantity));
});

// C-INV-02
test("lista ordenada por produto; busca e filtro por localização; Limpar", async ({ page }) => {
  await goToEstoque(page);

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Caneca Azul");
  await expect(rows.nth(1)).toContainText("Squeeze");

  await page.getByPlaceholder("Buscar por produto...").fill("squeeze");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Squeeze");
  await page.getByPlaceholder("Buscar por produto...").fill("");

  await page.getByPlaceholder("Filtrar por localização...").fill("Depósito A");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Caneca Azul");

  await page.getByRole("button", { name: "Limpar" }).click();
  await expect(rows).toHaveCount(2);
});

// C-INV-03
test("criar item de estoque", async ({ page }) => {
  await goToEstoque(page);
  await page.getByRole("button", { name: "Novo Item" }).click();

  await page.getByLabel("Nome do Produto *").fill("Item Novo");
  await page.getByLabel("Quantidade *").fill("4");
  await page.getByLabel("Custo Unitário (R$) *").fill("25");
  await expect(page.getByText(`R$ ${formatBRL(100)}`)).toBeVisible(); // Valor Total = 4*25
  await page.getByLabel("Localização").fill("Depósito B");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(page.getByRole("row").filter({ hasText: "Item Novo" })).toBeVisible();
});

test("editar item recalcula o valor total (quantidade × custo unitário)", async ({ page }) => {
  await goToEstoque(page);
  const row = page.getByRole("row").filter({ hasText: "Squeeze" });
  await row.locator("button:has(svg.lucide-pencil)").click();

  await page.getByLabel("Quantidade *").fill("10");
  await page.getByLabel("Custo Unitário (R$) *").fill("15");
  await expect(page.getByText(`R$ ${formatBRL(150)}`)).toBeVisible();
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();

  await expect(page.getByRole("row").filter({ hasText: "Squeeze" })).toContainText(
    `R$ ${formatBRL(150)}`,
  );
});

test("excluir item pede confirmação (dialog nativo)", async ({ page }) => {
  await goToEstoque(page);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Squeeze" })
    .locator("button:has(svg.lucide-trash2)")
    .click();

  await expect(page.getByRole("row").filter({ hasText: "Squeeze" })).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
