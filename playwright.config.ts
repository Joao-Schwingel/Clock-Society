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
  webServer: [
    {
      command: "node e2e/mock-server/server.mjs",
      url: MOCK_URL,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_PORT: String(MOCK_PORT) },
    },
    {
      command: `pnpm exec next dev -p ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
        TZ: "America/Sao_Paulo",
      },
    },
  ],
});
