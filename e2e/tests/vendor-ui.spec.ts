import { test, expect, login, formatBRL } from "../test-helpers";

// Fase 5 §5 "Telas" / Fase 6 fatia 6.8 — área do vendedor (/vendedor), contra o mock (que emula as
// políticas da 020, a vendor_sales e a commission_summary da 016). Decisões da #13 (08/10/2026).
// vend-a@t1 = Ana (empresa A): vendas 1001, 1003 (compartilhada com Bruno, pendente), 1006, 1008, 1010.

type Page = import("@playwright/test").Page;

async function signInVendor(page: Page, email: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/vendedor/);
}

const row = (page: Page, order: string) => page.getByRole("row").filter({ hasText: order });
const card = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
  });

test("V-UI-01 — vend-a@t1 vê [empresas em que atua] → Vendas, Comissões e Estoque, sem os cartões de visão geral", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await expect(page.getByRole("heading", { name: "Clock Society" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText(["Vendas", "Comissões", "Estoque"]);
  await expect(page.getByRole("button", { name: "Configurações" })).toHaveCount(0);
  await expect(card(page, "Receita")).toHaveCount(0);
  await expect(card(page, "Lucro")).toHaveCount(0);
});

test("V-UI-02 — vend-ab@t1 (Carla em A e B) vê o seletor com as duas empresas, e só elas", async ({ page }) => {
  await signInVendor(page, "vend-ab@t1.test");
  await expect(page.getByRole("tab", { name: "Clock Society" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "The Secret" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Morfeus" })).toHaveCount(0);

  await page.getByRole("tab", { name: "The Secret" }).click();
  await expect(page.getByRole("heading", { name: "The Secret" })).toBeVisible();
});

test("V-UI-02 — quem atua numa empresa só não vê seletor", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await expect(page.getByRole("tab", { name: "Clock Society" })).toHaveCount(0);
});

test("V-UI-03 — vend-zero@t1 (vínculo sem vendas) vê estado vazio, sem erro", async ({ page }) => {
  await signInVendor(page, "vend-zero@t1.test");
  await expect(page.getByText("Nenhuma venda registrada ainda.")).toBeVisible();
  await expect(card(page, "Vendas Concluídas")).toContainText("0");
});

test("V-UI-03 — vendedor-sem-vinculo@t1 vê estado vazio, sem erro (antes: /403 — ver docs/fase-5/README.md)", async ({ page }) => {
  await signInVendor(page, "vendedor-sem-vinculo@t1.test");
  await expect(page.getByText("Nenhuma empresa vinculada ao seu usuário. Fale com o administrador.")).toBeVisible();
});

test("V-UI-04 — Vendas de vend-a@t1: só as dele (inclui a compartilhada com Bruno); sem Custo Total, sem coluna líquida, sem exportar", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  for (const order of ["1001", "1003", "1006", "1008", "1010"]) await expect(row(page, order)).toBeVisible();
  await expect(row(page, "1002")).toHaveCount(0); // só do Bruno

  await expect(page.getByRole("columnheader", { name: "Custo Total" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Total", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exportar" })).toHaveCount(0); // Q4: só o admin
});

test("V-UI-04 — a única ação é o \"olho\" (3.9)", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  const actions = row(page, "1001").getByRole("button");
  await expect(actions).toHaveCount(1);
  await expect(actions).toHaveAccessibleName("Ver detalhes");
});

test("V-UI-04 — coluna de vendedores: nomes de todos, % só do próprio (3.1)", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  const shared = row(page, "1003");
  await expect(shared).toContainText("Ana (10%)");
  await expect(shared).toContainText("Bruno");
  await expect(shared).not.toContainText("(5%)"); // % do Bruno nessa venda
});

test("V-UI-04 — filtros, busca e paginação funcionam no subconjunto do vendedor", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await page.getByPlaceholder("Buscar por nº do pedido, produto ou cliente...").fill("1006");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(row(page, "1006")).toBeVisible();

  // apagar o texto desfaz a busca (C-SALES-03)
  await page.getByPlaceholder("Buscar por nº do pedido, produto ou cliente...").fill("");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.locator('[role="combobox"]').filter({ hasText: "Status" }).click();
  await page.getByRole("option", { name: "Pendente" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(row(page, "1003")).toBeVisible();
});

test("3.9 — o detalhe da venda mostra produtos e custos, só leitura", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await row(page, "1003").getByRole("button", { name: "Ver detalhes" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Detalhes da Venda");
  await expect(dialog).toContainText("Tarifas");
  await expect(dialog).toContainText("Transporte");
  await expect(dialog.getByRole("button", { name: "Adicionar Custo" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Excluir custo" })).toHaveCount(0);
});

test("V-UI-05 — cartões da aba Vendas: nº de vendas, valor vendido e comissão do período vinda da RPC (3.3)", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await expect(card(page, "Vendas Concluídas")).toContainText("4");
  await expect(card(page, "Valor Vendido")).toContainText(`R$ ${formatBRL(600)}`);
  await expect(card(page, "Minha Comissão")).toContainText(`R$ ${formatBRL(60)}`);
});

test("V-UI-06 — Comissões: os mesmos números do admin, sem a comissão dos colegas e sem o inativo (#13)", async ({ page, browser }) => {
  await signInVendor(page, "vend-a@t1.test");
  await page.getByRole("tab", { name: "Comissões" }).click();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage);

  for (const name of ["Ana", "Bruno", "Carla", "Diego", "Site"]) {
    for (const label of ["Total de Vendas:", "Custos das Vendas:", "Lucro Líquido:"]) {
      const adminLine = card(adminPage, name).getByText(label).locator("..");
      await expect(adminLine).toBeVisible();
      await expect(card(page, name).getByText(label).locator("..")).toHaveText((await adminLine.textContent()) ?? "");
    }
  }
  await expect(card(page, "Ana")).toContainText("Comissão Total:");
  await expect(card(page, "Bruno")).not.toContainText("Comissão Total:");
  await expect(card(page, "Elis")).toHaveCount(0);
  await expect(card(adminPage, "Elis")).toContainText("INATIVO");
  await adminContext.close();
});

test("V-UI-07 — Estoque: todas as colunas, inclusive custo; cartões de resumo; sem Novo Item, sem ações e sem formulário", async ({ page }) => {
  await signInVendor(page, "vend-a@t1.test");
  await page.getByRole("tab", { name: "Estoque" }).click();
  await expect(row(page, "Caneca Azul")).toBeVisible();
  await expect(row(page, "Squeeze")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Custo Unit." })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Ações" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo Item" })).toHaveCount(0);
  await expect(card(page, "Valor Total")).toContainText(`R$ ${formatBRL(1450)}`);
});
