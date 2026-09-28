import { test, expect, login, MOCK_URL } from "../test-helpers";

// Fase 2 §5 "Inicialização e inquilino" / Fase 3 fatias 3.4 e 3.6.
// As chamadas a `companies` saem do servidor Next (app/dashboard/page.tsx), que o page.route()
// não intercepta — por isso os testes leem o log de requisições do mock server.

type LoggedRequest = { method: string; table: string; search: string; auth: string };

async function companiesRequests(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get(`${MOCK_URL}/__test__/requests`);
  const log = (await res.json()) as LoggedRequest[];
  return log.filter((r) => r.table === "companies" && r.auth === "user");
}

// Substitui C-NAV-04 (Fase 2 §6).
test("A-BOOT-01 — admin sem empresas vê 'Nenhuma empresa disponível.' e a tela não quebra (N4)", async ({
  page,
  request,
}) => {
  // Sem header Authorization, o harness fala com o mock como o service_role (e2e/mock-server/rls.mjs).
  const del = await request.delete(`${MOCK_URL}/rest/v1/companies?user_id=eq.u-admin`);
  expect(del.ok()).toBeTruthy();

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("admin@t1.test");
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard/);

  await expect(page.getByText("Nenhuma empresa disponível.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});

test("A-BOOT-01 — entrar sem empresas não envia nenhum insert em companies", async ({ page, request }) => {
  await request.delete(`${MOCK_URL}/rest/v1/companies?user_id=eq.u-admin`);

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("admin@t1.test");
  await page.getByLabel("Senha").fill("senha123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Nenhuma empresa disponível.")).toBeVisible();

  expect((await companiesRequests(request)).filter((r) => r.method === "POST")).toEqual([]);
  const remaining = await request.get(`${MOCK_URL}/rest/v1/companies?user_id=eq.u-admin`);
  expect(await remaining.json()).toEqual([]);
});

// Rede mockada: afirma o que a tela MANDA, não o que o RLS devolve.
test("A-BOOT-02 — a consulta de companies não envia mais o filtro user_id=eq.<id do usuário logado>", async ({
  page,
  request,
}) => {
  await login(page);

  const reads = (await companiesRequests(request)).filter((r) => r.method === "GET");
  expect(reads.length).toBeGreaterThan(0);
  for (const r of reads) expect(r.search).not.toContain("user_id");

  // E o RLS emulado continua escondendo a empresa de outro inquilino (Empresa X, de outro@t2).
  await expect(page.getByRole("tab", { name: "Empresa X" })).toHaveCount(0);
});
