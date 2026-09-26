import { test, expect, login } from "../test-helpers";

async function goToContratos(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("tab", { name: "Contratos" }).click();
}

async function pickDate(page: import("@playwright/test").Page, fieldId: string, dateDDMMYYYY: string) {
  await page.locator(`#${fieldId}`).click();
  await page.locator(`[data-slot="calendar"] button[data-day="${dateDDMMYYYY}"]`).click();
}

// C-CON-02
// ACHADO (mesmo de fixed-costs.spec.ts): contracts-form.tsx e
// contracts-table.tsx usam useToast() do shadcn, cujo <Toaster/> nunca é
// montado em app/layout.tsx (só o do sonner está) — toasts de
// sucesso/erro aqui nunca aparecem na tela.
test("criar contrato", async ({ page }) => {
  await goToContratos(page);

  await page.getByLabel("Nome do Contrato *").fill("Contrato Teste");
  await page.getByLabel("Valor Mensal (R$) *").fill("777");
  await pickDate(page, "start_date", "15/09/2026");
  await page.getByRole("button", { name: "Adicionar Contrato" }).click();

  await expect(page.getByRole("row").filter({ hasText: "Contrato Teste" })).toContainText("777");
});

test("busca por nome ou descrição", async ({ page }) => {
  await goToContratos(page);

  await page.getByPlaceholder("Buscar por nome ou descrição...").fill("marketing");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Marketing");
});

test("filtro pelo mês de início", async ({ page }) => {
  await goToContratos(page);

  await page.locator('input[type="month"]').fill("2026-07");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Marketing"); // ct-3, start_date 2026-07-01
});

test("excluir contrato pede confirmação (dialog nativo)", async ({ page }) => {
  await goToContratos(page);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Contador" })
    .getByRole("button")
    .click();

  await expect(page.getByRole("row").filter({ hasText: "Contador" })).toHaveCount(0);
});
