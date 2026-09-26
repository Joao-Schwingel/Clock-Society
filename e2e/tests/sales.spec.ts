import { test, expect, login, formatBRL, MOCK_URL } from "../test-helpers";

// ACHADO: o placeholder de busca é escrito em sales-table.tsx como um
// atributo JSX puro (`placeholder="...cliente\u2026"`, fora de `{}`).
// Dentro de um atributo JSX assim, "\u2026" NÃO é interpretado como
// escape Unicode (isso só acontece em string literals de JS de verdade —
// uma string dentro de `{}`), então o texto que chega na tela é
// literalmente "...cliente\u2026" (com a barra invertida e "u2026"
// como caracteres visíveis), não "...cliente…" com um "…" de verdade.
const SEARCH_PLACEHOLDER = "Buscar por nº do pedido, produto ou cliente\\u2026";

async function goToVendas(page: import("@playwright/test").Page) {
  await login(page);
  await page.getByRole("tab", { name: "Vendas" }).click();
  await expect(page).toHaveURL(/tab=vendas/);
}

function row(page: import("@playwright/test").Page, orderNumber: string) {
  return page.getByRole("row").filter({ hasText: orderNumber });
}

function comboboxByText(page: import("@playwright/test").Page, text: string) {
  return page.locator('[role="combobox"]').filter({ hasText: text });
}

// C-SALES-02
test("tabela paginada de 10 em 10, por nº de pedido decrescente", async ({ page }) => {
  await goToVendas(page);

  await expect(page.getByText("1–10 de 11 vendas")).toBeVisible();
  const orderCells = page.locator("tbody tr td:nth-child(2)");
  await expect(orderCells).toHaveText([
    "1011", "1010", "1009", "1008", "1007", "1006", "1005", "1004", "1003", "1002",
  ]);

  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.getByText("11–11 de 11 vendas")).toBeVisible();
  await expect(orderCells).toHaveText(["1001"]);

  await expect(page.getByRole("button", { name: "Próximo" })).toBeDisabled();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByText("1–10 de 11 vendas")).toBeVisible();
});

// C-SALES-03
test("busca por trecho do cliente ou produto, sem diferenciar maiúsculas", async ({ page }) => {
  await goToVendas(page);

  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("MARIA");
  await page.getByRole("button", { name: "Buscar" }).click();

  // Com <=10 resultados a tabela cabe em 1 página, e o rodapé "X–Y de Z
  // vendas" não é renderizado (sales-table.tsx só o mostra com totalPages>1)
  // — por isso conferimos as linhas em vez do texto do rodapé.
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(row(page, "1001")).toBeVisible();
  await expect(row(page, "1003")).toBeVisible();

  await search.fill("");
  await expect(page.getByText("1–10 de 11 vendas")).toBeVisible();
});

test("busca por nº de pedido exato", async ({ page }) => {
  await goToVendas(page);
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("1005");
  await search.press("Enter");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(row(page, "1005")).toBeVisible();
});

// C-SALES-04
test("filtro de vendedor sem vendas mostra nenhum resultado", async ({ page }) => {
  await goToVendas(page);

  await comboboxByText(page, "Vendedor").click();
  await page.getByRole("option", { name: "Diego" }).click();

  await expect(page.getByText("Nenhum resultado encontrado.")).toBeVisible();
});

test("filtro de status mostra só as vendas concluídas", async ({ page }) => {
  await goToVendas(page);

  await comboboxByText(page, "Status").click();
  await page.getByRole("option", { name: "Concluída" }).click();

  await expect(row(page, "1003")).not.toBeVisible(); // pendente
  await expect(row(page, "1001")).toBeVisible(); // concluída
});

test("filtro Somente com valor faltante e Limpar filtros", async ({ page }) => {
  await goToVendas(page);

  await page.getByLabel("Somente com valor faltante").check();
  // sale-a-02 (pago, sem faltante) some; sale-a-03/09 (pendentes com faltante) ficam
  await expect(row(page, "1002")).not.toBeVisible();
  await expect(row(page, "1003")).toBeVisible();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("1–10 de 11 vendas")).toBeVisible();
});

// C-SALES-05
test("colunas da tabela batem com a tabela esperada (linha 1002)", async ({ page }) => {
  await goToVendas(page);
  const r = row(page, "1002");
  await expect(r).toContainText(`R$ ${formatBRL(20)}`); // Custo Total
  await expect(r).toContainText(`R$ ${formatBRL(130)}`); // Total (150 - 20)
  await expect(r).toContainText(`R$ ${formatBRL(150)}`); // Entrada
});

test('linha sem entrada mostra "-" e faltante = total', async ({ page }) => {
  await goToVendas(page);
  const r = row(page, "1009");
  await expect(r).toContainText(`R$ ${formatBRL(250)}`); // Faltante = total (entrada 0)
  const cells = await r.locator("td").allTextContents();
  expect(cells).toContain("-"); // coluna Entrada
});

// C-SALES-06
test("confirmar pagamento só aparece com entrada != total, pendente e faltante > 0", async ({
  page,
}) => {
  await goToVendas(page);
  // 1002 (pago, entrada==total): sem botão de confirmar pagamento (ícone $)
  await expect(row(page, "1002").locator("button:has(svg.lucide-dollar-sign)")).toHaveCount(0);
  // 1003 (pendente, entrada 100 de 400, faltante 300): tem o botão de confirmar
  await expect(row(page, "1003").locator("button:has(svg.lucide-dollar-sign)")).toHaveCount(1);
});

test("alternar status concluída/pendente", async ({ page, request }) => {
  await goToVendas(page);
  // "1010" está na página 1 (visão padrão, sem filtro, ordenada desc); "1001"
  // só apareceria na página 2.
  const r = row(page, "1010"); // concluída -> mostra CircleX pra voltar a pendente
  await r.locator("button:has(svg.lucide-circle-x)").click();

  await expect(row(page, "1010")).toContainText("Pendente");

  const check = await request.get(`${MOCK_URL}/rest/v1/sales?order_number=eq.1010`);
  const [sale] = await check.json();
  expect(sale.status).toBe("pendente");
});

test("excluir venda pede confirmação e remove a linha", async ({ page }) => {
  await goToVendas(page);
  await expect(row(page, "1011")).toBeVisible();

  await row(page, "1011").locator("button:has(svg.lucide-trash2)").click();
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(row(page, "1011")).not.toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);
});

// C-SALES-07
test("nova venda: nº de pedido repetido na mesma empresa bloqueia com mensagem", async ({
  page,
}) => {
  await goToVendas(page);
  await page.getByRole("button", { name: "Nova Venda" }).click();

  await page.getByLabel("Número do Pedido *").fill("1001"); // já existe
  await page.getByLabel("Nome do Produto *").fill("Produto Teste");
  await page.locator('[role="combobox"]').filter({ hasText: "Selecione um vendedor" }).click();
  await page.getByRole("option", { name: "Ana" }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(page.getByText("Já existe uma venda com este número de pedido.")).toBeVisible();
});

test("nova venda: sem vendedor bloqueia com mensagem", async ({ page }) => {
  await goToVendas(page);
  await page.getByRole("button", { name: "Nova Venda" }).click();

  await page.getByLabel("Número do Pedido *").fill("9999");
  await page.getByLabel("Nome do Produto *").fill("Produto Teste");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(page.getByText("Sem vendedor associado.")).toBeVisible();
});

test("nova venda: entrada vazia é à vista (pago) e mostra toast de sucesso", async ({ page }) => {
  await goToVendas(page);
  await page.getByRole("button", { name: "Nova Venda" }).click();

  await page.getByLabel("Número do Pedido *").fill("9001");
  await page.getByLabel("Nome do Produto *").fill("Produto Novo");
  await page.getByLabel("Quantidade *").fill("2");
  await page.locator("#totalPrice").fill("300");
  await page.locator('[role="combobox"]').filter({ hasText: "Selecione um vendedor" }).click();
  await page.getByRole("option", { name: "Ana" }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  await expect(page.getByText("Venda cadastrada com sucesso")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "9001" })).toBeVisible();
});

// C-SALES-08
test("editar venda carrega itens e vendedores; salva o valor líquido total digitado", async ({
  page,
}) => {
  await goToVendas(page);
  await row(page, "1003").locator("button:has(svg.lucide-pencil)").click();

  await expect(page.getByRole("dialog")).toContainText("Editar Venda");
  await expect(page.getByLabel("Número do Pedido *")).toHaveValue("1003");
  // 2 itens (Caneca Azul + Camiseta Preta) e 2 vendedores (Ana + Bruno)
  await expect(page.getByText("Item 1")).toBeVisible();
  await expect(page.getByText("Item 2")).toBeVisible();
  await expect(page.locator("#totalPrice")).toHaveValue("400");

  await page.locator("#totalPrice").fill("500");
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();

  // N1: o valor digitado é o que fica salvo (o gatilho recalc_sale_total,
  // se existir no banco real, não é exercitado pelo mock — checklist MANUAL).
  await expect(row(page, "1003")).toContainText(formatBRL(500 - 40)); // Total = 500 - custos(40)
});

// C-SALES-09
test("detalhes: dados, produtos, custos e resumo; adicionar custo atualiza tudo", async ({
  page,
}) => {
  await goToVendas(page);
  await row(page, "1002").locator("button:has(svg.lucide-eye)").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Detalhes da Venda");
  await expect(dialog).toContainText("Camiseta Preta"); // Produtos
  await expect(dialog).toContainText("Transporte"); // Custos
  await expect(dialog.getByText(`R$ ${formatBRL(130)}`)).toBeVisible(); // Lucro Líquido = 150-20

  await dialog.getByRole("button", { name: "Adicionar Custo" }).click();
  await page.locator('[role="combobox"]').filter({ hasText: "Selecione o tipo" }).click();
  await page.getByRole("option", { name: "Impostos" }).click();
  await page.getByLabel("Valor (R$) *").fill("10");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();

  // Resumo do modal atualiza: custos 20+10=30, lucro 150-30=120
  await expect(dialog.getByText(`R$ ${formatBRL(120)}`)).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  // Tabela e cartões (fora do modal) também refletem o novo custo total
  await expect(row(page, "1002")).toContainText(`R$ ${formatBRL(30)}`); // Custo Total
});

// C-SALES-11
test("exportar respeita os filtros ativos e ignora a paginação", async ({ page }) => {
  await goToVendas(page);
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("Camiseta");
  await page.getByRole("button", { name: "Buscar" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^vendas-\d{4}-\d{2}-\d{2}\.csv$/);
});
