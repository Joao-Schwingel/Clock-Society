import { test, expect, login, formatBRL, cardByTitle } from "../test-helpers";
import expected from "../fixtures/expected-numbers.json";

async function cardTotal(page: import("@playwright/test").Page, title: string) {
  return cardByTitle(page, title).locator(".text-2xl").innerText();
}

async function selectOnlyMonth(page: import("@playwright/test").Page, monthLabel: string) {
  await page.getByRole("button", { name: /Selecionar meses|Selecionar/ }).click();
  await page.getByText(monthLabel, { exact: true }).click();
  await page.keyboard.press("Escape");
}

async function selectAllMonths(page: import("@playwright/test").Page) {
  const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  await page.getByRole("button", { name: /Selecionar meses|Selecionar/ }).click();
  for (const m of MONTHS) await page.getByText(m, { exact: true }).click();
  await page.keyboard.press("Escape");
}

function cardTitleLocator(page: import("@playwright/test").Page, name: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${name}$`) }),
  });
}

// C-DASH-03: cartões batem com a tabela esperada
//
// ACHADO: quando nenhum mês está selecionado, o dashboard NÃO filtra as
// vendas pelo ano escolhido no seletor — a query de vendas só recebe um
// filtro de data quando months.length > 0 (dashboard-view.tsx). "2026
// inteiro" precisa ser obtido marcando os 12 meses explicitamente; o estado
// padrão (nenhum mês marcado) soma vendas de TODOS os anos.
test("cartões do dashboard batem com a tabela esperada (2026, os 12 meses marcados)", async ({
  page,
}) => {
  await login(page);
  const oracle = expected.companies.A.dashboard["2026-inteiro"];

  await selectAllMonths(page);

  await expect(cardByTitle(page, "Receita")).toContainText(`R$ ${formatBRL(oracle.receita)}`);
  await expect(cardByTitle(page, "Receita Líquida")).toContainText(
    `R$ ${formatBRL(oracle.receitaLiquida)}`,
  );
  await expect(cardByTitle(page, "Comissões")).toContainText(`R$ ${formatBRL(oracle.comissoes)}`);
  await expect(cardByTitle(page, "Custos de Vendas")).toContainText(
    `R$ ${formatBRL(oracle.custosVendas)}`,
  );
  await expect(cardByTitle(page, "Custos Gerais")).toContainText(`R$ ${formatBRL(oracle.custosGerais)}`);
  await expect(cardByTitle(page, "Lucro")).toContainText(`R$ ${formatBRL(oracle.lucro)}`);
});

test("cartões do dashboard batem com a tabela esperada (set/2026 filtrado)", async ({ page }) => {
  await login(page);
  const oracle = expected.companies.A.dashboard["2026-09"];

  await selectOnlyMonth(page, "Setembro");

  await expect(cardByTitle(page, "Receita")).toContainText(`R$ ${formatBRL(oracle.receita)}`);
  await expect(cardByTitle(page, "Lucro")).toContainText(`R$ ${formatBRL(oracle.lucro)}`);
  await expect(cardByTitle(page, "Comissões")).toContainText(`R$ ${formatBRL(oracle.comissoes)}`);
});

test("mês sem vendas mostra os cartões zerados, exceto Custos Gerais", async ({ page }) => {
  await login(page);
  const oracle = expected.companies.A.dashboard["2026-07-sem-vendas"];

  await selectOnlyMonth(page, "Julho");

  await expect(cardByTitle(page, "Receita")).toContainText(`R$ ${formatBRL(oracle.receita)}`);
  await expect(cardByTitle(page, "Custos Gerais")).toContainText(`R$ ${formatBRL(oracle.custosGerais)}`);
  await expect(cardByTitle(page, "Lucro")).toContainText(`R$ ${formatBRL(oracle.lucro)}`);
});

// C-DASH-04: cartões por vendedor
test("cartões por vendedor: só ativos aparecem, inativa (Elis) fica de fora", async ({ page }) => {
  await login(page);
  await selectOnlyMonth(page, "Setembro");
  const oracle = expected.companies.A.dashboard["2026-09"].porVendedor;

  await expect(cardTitleLocator(page, "Ana")).toBeVisible();
  await expect(cardTitleLocator(page, "Bruno")).toBeVisible();
  await expect(cardTitleLocator(page, "Carla")).toBeVisible();
  await expect(cardTitleLocator(page, "Diego")).toBeVisible();
  await expect(cardTitleLocator(page, "Site")).toBeVisible();
  await expect(cardTitleLocator(page, "Elis")).toHaveCount(0);

  // Diego (ativo, sem vendas) mostra "Sem comissão no período"
  await expect(cardTitleLocator(page, "Diego")).toContainText("Sem comissão no período");

  const anaCard = cardTitleLocator(page, "Ana");
  await expect(anaCard).toContainText(`${oracle.Ana.vendas} vendas concluídas`);
  await expect(anaCard).toContainText(`R$ ${formatBRL(oracle.Ana.comissao)}`);
});
