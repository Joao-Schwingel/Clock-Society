import { afterEach, beforeEach, vi } from "vitest";

// Relógio dos testes (spec Fase 1 §4): 15/09/2026 12:00 em America/Sao_Paulo (UTC-03:00).
const FIXED_NOW = new Date("2026-09-15T15:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});
