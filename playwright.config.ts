import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const MOCK_PORT = 3101;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// Spec Fase 1 §2/§3: Playwright (Chromium) contra `next dev`, sem nenhum banco
// de dados conectado — toda chamada ao Supabase vai para o mock server local
// (e2e/mock-server), nunca para um Supabase real.
export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: APP_URL,
    timezoneId: "America/Sao_Paulo",
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // `reuseExistingServer` fica SEMPRE false, inclusive fora do CI. O teste de
  // reuso do Playwright só verifica que a porta responde — ele não olha com que
  // NEXT_PUBLIC_SUPABASE_URL o processo subiu. Com reuso ligado, um `next dev
  // -p 3100` já rodando com o .env.local real seria adotado pela suíte, o bloco
  // `env` abaixo seria ignorado, e os testes que escrevem (inserem o pedido
  // 9001, apagam a venda 1011, apagam o contrato "Contador", desativam o
  // Diego) iriam para o Supabase de verdade — o `POST /__test__/reset` do mock
  // não desfaz nada disso. Ver a regra absoluta no CLAUDE.md: nenhum teste
  // automatizado conecta em banco real. Com false, uma porta ocupada vira erro
  // alto e claro em vez de silenciosamente rodar contra o servidor errado.
  webServer: [
    {
      command: "node e2e/mock-server/server.mjs",
      url: MOCK_URL,
      reuseExistingServer: false,
      env: { MOCK_PORT: String(MOCK_PORT) },
    },
    {
      command: `pnpm exec next dev -p ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
        // Chave de serviço do MOCK (nunca uma chave real): usada pela troca de senha (6.6).
        SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key",
        TZ: "America/Sao_Paulo",
      },
    },
  ],
});
