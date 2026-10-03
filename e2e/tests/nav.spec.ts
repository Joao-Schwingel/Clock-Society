import { test, expect, login } from "../test-helpers";

const COMPANY_TAB_NAMES = ["Clock Society", "The Secret", "Morfeus", "Contratos"];

function companyTabs(page: import("@playwright/test").Page) {
  return page.getByRole("tab").filter({ hasText: new RegExp(`^(${COMPANY_TAB_NAMES.join("|")})$`) });
}

// C-NAV-01
test("abas das empresas ordenadas por code, seguidas de Contratos", async ({ page }) => {
  await login(page);
  await expect(companyTabs(page)).toHaveText(COMPANY_TAB_NAMES);
});

test("a aba ativa vai para ?company= e sobrevive a recarregar a página", async ({ page }) => {
  await login(page);
  // Assenta a URL da subaba (tab=dashboard) antes de trocar de empresa: os
  // dois hooks useTabWithQuery competem quando montam juntos (achado desta
  // fase, ver login() em test-helpers.ts) — clicar a subaba já ativa primeiro
  // evita que o CompanyDashboard recém-montado da outra empresa dispare essa
  // mesma corrida de novo.
  await page.getByRole("tab", { name: "Vendas" }).click();
  await expect(page).toHaveURL(/tab=vendas/);

  await page.getByRole("tab", { name: "The Secret" }).click();
  await expect(page).toHaveURL(/company=B/);

  await page.reload();
  await expect(page.getByRole("tab", { name: "The Secret" })).toHaveAttribute("aria-selected", "true");
});

// C-NAV-02
// Achado desta fase: na montagem inicial só "?company=" chega na URL (a
// corrida descrita em login()); o padrão "dashboard" é visível pelo estado
// da aba (aria-selected), não pela URL, até o primeiro clique numa subaba —
// a partir daí, cada troca de subaba atualiza "?tab=" corretamente.
test("subaba Dashboard é a selecionada por padrão", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
});

test("subabas Vendas/Estoque/Custos sincronizam ?tab= ao serem clicadas", async ({ page }) => {
  await login(page);

  await page.getByRole("tab", { name: "Vendas" }).click();
  await expect(page).toHaveURL(/tab=vendas/);

  await page.getByRole("tab", { name: "Estoque" }).click();
  await expect(page).toHaveURL(/tab=estoque/);

  await page.getByRole("tab", { name: "Custos" }).click();
  await expect(page).toHaveURL(/tab=custos-fixos/);
});

// C-NAV-03
test('"Configurações" abre o modal de vendedores', async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByRole("dialog")).toContainText("Configurações - Vendedores");
  await expect(page.getByRole("tab", { name: "Lista de Vendedores" })).toBeVisible();
});

// C-NAV-04 — removido na Fase 3: substituído por A-BOOT-01 (Fase 2 §6), em
// e2e/tests/admin-bootstrap.spec.ts. O auto-create de empresas deixou de existir (N4).
