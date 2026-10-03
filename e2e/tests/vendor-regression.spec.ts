import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test, expect, login } from "../test-helpers";

// Fase 5 §5 "Regressão do admin" / Fase 6 fatias 6.1 e 6.4.

const GOLDEN_DIR = join(__dirname, "..", "fixtures", "golden-csv");
const SEARCH_PLACEHOLDER = "Buscar por nº do pedido, produto ou cliente...";
type Page = import("@playwright/test").Page;

async function goToVendas(page: Page) {
  await login(page);
  await page.getByRole("tab", { name: "Vendas" }).click();
  await expect(page).toHaveURL(/tab=vendas/);
}

async function exportCsv(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar" }).click(),
  ]);
  return readFileSync(await download.path());
}

// Compara com a "foto" do CSV gravada ANTES da extração do motor de vendas (6.1).
// UPDATE_GOLDEN=1 regrava as fotos — só faz sentido com o código antigo.
function expectSameAsGolden(name: string, csv: Buffer) {
  const file = join(GOLDEN_DIR, `${name}.csv`);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) {
    if (process.env.UPDATE_GOLDEN !== "1") throw new Error(`Foto ausente: ${file}. Gere com UPDATE_GOLDEN=1.`);
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, csv);
    return;
  }
  expect(csv.equals(readFileSync(file)), `CSV "${name}" diferente da foto`).toBe(true);
}

test.describe("V-REG-02 — CSV idêntico byte a byte depois da extração do motor de vendas", () => {
  test("sem filtros", async ({ page }) => {
    await goToVendas(page);
    expectSameAsGolden("sem-filtros", await exportCsv(page));
  });

  test("busca por texto", async ({ page }) => {
    await goToVendas(page);
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill("Camiseta");
    await page.getByRole("button", { name: "Buscar" }).click();
    expectSameAsGolden("busca-camiseta", await exportCsv(page));
  });

  test("filtro de vendedor", async ({ page }) => {
    await goToVendas(page);
    await page.locator('[role="combobox"]').filter({ hasText: "Vendedor" }).click();
    await page.getByRole("option", { name: "Ana" }).click();
    expectSameAsGolden("vendedor-ana", await exportCsv(page));
  });

  test("filtro de mês do topo", async ({ page }) => {
    await goToVendas(page);
    await page.getByRole("button", { name: /Selecionar meses|Selecionar/ }).click();
    await page.getByText("Setembro", { exact: true }).click();
    await page.keyboard.press("Escape");
    expectSameAsGolden("mes-setembro", await exportCsv(page));
  });

  test("status pendente + somente com valor faltante", async ({ page }) => {
    await goToVendas(page);
    await page.locator('[role="combobox"]').filter({ hasText: "Status" }).click();
    await page.getByRole("option", { name: "Pendente" }).click();
    await page.getByLabel("Somente com valor faltante").check();
    expectSameAsGolden("pendente-com-faltante", await exportCsv(page));
  });

  test("vendedor sem vendas: avisa que não há dados e não baixa nada", async ({ page }) => {
    await goToVendas(page);
    await page.locator('[role="combobox"]').filter({ hasText: "Vendedor" }).click();
    await page.getByRole("option", { name: "Diego" }).click();
    await page.getByRole("button", { name: "Exportar" }).click();
    await expect(page.getByText("Nenhum dado para exportar")).toBeVisible();
  });
});

test.fixme("V-REG-01 — dashboard do admin alimentado pela RPC mostra os números da Fase 1 (C-DASH-03/04), com as regras de Q2/Q10 (#13)", () => {});
test.fixme("V-REG-03 — o vendedor Site continua selecionável e somando vendas sem ter login", () => {});
