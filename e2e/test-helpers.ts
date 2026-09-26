import { test as base, expect } from "@playwright/test";

export const MOCK_URL = process.env.MOCK_SERVER_URL ?? "http://127.0.0.1:3101";

// Reseta o estado do mock server (volta aos fixtures originais) e congela o
// relógio do navegador antes de cada teste, para que nenhum teste dependa do
// que o anterior deixou (spec §11) nem do dia em que a suíte roda.
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const res = await request.post(`${MOCK_URL}/__test__/reset`);
    if (!res.ok()) throw new Error(`Falha ao resetar o mock server: ${res.status()}`);
    await freezeClock(page);
    await use(page);
  },
});

export { expect };

export const ADMIN_EMAIL = "admin@t1.test";
export const ADMIN_PASSWORD = "senha123";

// Relógio fixo da spec Fase 1 §4: 15/09/2026 12:00 -03:00.
export const FIXED_NOW = new Date("2026-09-15T15:00:00.000Z");

// Chamado pela fixture `page` acima, em TODO teste — sem isso a suíte roda no
// relógio real, enquanto o oráculo (e os seletores de data, que clicam em
// `data-day="15/09/2026"` num calendário que abre no mês corrente) estão
// fixados em 15/09/2026.
//
// `setFixedTime` e não `install`: só congela Date.now()/new Date(), deixando os
// timers correrem. `install` pausa o relógio, o que trava o React e a
// auto-espera do Playwright.
export async function freezeClock(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(FIXED_NOW);
}

// Mesma formatação usada pelo app (v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })),
// chamada aqui de novo (não importada do app) só para não transcrever strings à mão.
export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export function cardByTitle(page: import("@playwright/test").Page, title: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
  });
}

export async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Espera o "?company=" aparecer, não só a chegada em /dashboard: na
  // montagem inicial, os dois hooks useTabWithQuery (empresa e subaba) correm
  // uma corrida por causa da mesma searchParams "stale" (achado desta fase,
  // não corrigido — ver e2e/tests/nav.spec.ts), e só o de "company" sobrevive.
  await page.waitForURL(/\/dashboard\?company=/);
}
