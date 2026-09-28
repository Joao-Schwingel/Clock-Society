import { test, expect, login, MOCK_URL } from "../test-helpers";

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

// C-NAV-04 — substituído por A-BOOT-01 na Fase 3 (Fase 2 §6; ver
// e2e/tests/admin-bootstrap.spec.ts). Sai quando o A-BOOT-01 ficar verde.
//
// ACHADO (não corrigido nesta fase, D-5): o fluxo de auto-criação
// (app/dashboard/page.tsx) insere as 3 empresas e, na mesma função, refaz a
// MESMA consulta select("*").eq("user_id",...).order("code") para pegar as
// linhas recém-criadas. O React/Next.js faz "Request Memoization" de
// chamadas fetch idênticas dentro do mesmo render — como @supabase/supabase-js
// não passa `cache: "no-store"`, a segunda chamada (idêntica à primeira, que
// rodou ANTES do insert) recebe o resultado antigo memoizado (lista vazia),
// e `DashboardLayout` quebra em `companies[0].code` (companies[0] é
// undefined). Confirmado isolando uma 3ª consulta com filtro diferente no
// mesmo render, que corretamente retornou os dados novos — não é um artefato
// do mock: @supabase/supabase-js usa o `fetch` global (o mesmo que o
// Next.js corrigiu), então o mesmo deve acontecer contra o Supabase real.
// Registrado como bug conhecido; o teste documenta o comportamento atual
// (quebra) com test.fail(), para acender se algum dia for corrigido.
test.fail(
  "primeiro acesso sem empresas cria Clock Society, The Secret e Morfeus",
  async ({ page, request }) => {
    const del = await request.delete(`${MOCK_URL}/rest/v1/companies?user_id=eq.u-admin`);
    expect(del.ok()).toBeTruthy();

    // Login "manual" (sem esperar por ?company=, que nunca chega neste
    // cenário quebrado): só espera a navegação para /dashboard.
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill("admin@t1.test");
    await page.getByLabel("Senha").fill("senha123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/dashboard/);

    await expect(companyTabs(page)).toHaveText(COMPANY_TAB_NAMES, { timeout: 5000 });
  },
);
