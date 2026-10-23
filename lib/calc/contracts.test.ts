import { describe, expect, it } from "vitest";
import {
  getContractActiveMonthsInYear,
  isContractActive,
  summarizeContracts,
} from "./contracts";

// C-CON-01
describe("isContractActive", () => {
  it("sem data de fim é sempre ativo", () => {
    expect(isContractActive({ end_date: null }, "2026-09-15")).toBe(true);
  });

  it("ativo quando fim >= hoje; encerrado quando fim < hoje", () => {
    expect(isContractActive({ end_date: "2026-09-15" }, "2026-09-15")).toBe(true);
    expect(isContractActive({ end_date: "2026-09-14" }, "2026-09-15")).toBe(false);
  });
});

describe("getContractActiveMonthsInYear", () => {
  it("contrato sem data de fim conta até o fim do ano", () => {
    const contract = { start_date: "2026-06-01", end_date: null };
    expect(getContractActiveMonthsInYear(contract, 2026)).toBe(7); // jun..dez
  });

  it("contrato iniciando no meio do ano conta a partir do início", () => {
    const contract = { start_date: "2026-10-01", end_date: null };
    expect(getContractActiveMonthsInYear(contract, 2026)).toBe(3); // out, nov, dez
  });

  it("contrato encerrado antes do ano corrente não conta nenhum mês", () => {
    const contract = { start_date: "2024-01-01", end_date: "2024-12-31" };
    expect(getContractActiveMonthsInYear(contract, 2026)).toBe(0);
  });

  it("contrato encerrado no meio do ano conta só até o mês do fim", () => {
    const contract = { start_date: "2026-01-01", end_date: "2026-06-30" };
    expect(getContractActiveMonthsInYear(contract, 2026)).toBe(6); // jan..jun
  });

  // A contagem é por índice ano*12+mês, então o dia do end_date é irrelevante:
  // qualquer fim dentro de junho conta junho inteiro.
  it("mês parcial conta como mês inteiro", () => {
    const start_date = "2026-01-01";
    expect(getContractActiveMonthsInYear({ start_date, end_date: "2026-06-01" }, 2026)).toBe(6);
    expect(getContractActiveMonthsInYear({ start_date, end_date: "2026-06-30" }, 2026)).toBe(6);
  });
});

describe("summarizeContracts", () => {
  it("total mensal soma só os ativos; total anual soma pelos meses ativos no ano", () => {
    const contracts = [
      { start_date: "2026-01-01", end_date: null, monthly_value: 1000 }, // ativo, 12 meses
      { start_date: "2020-01-01", end_date: "2025-12-31", monthly_value: 500 }, // encerrado
    ];
    const summary = summarizeContracts(contracts, "2026-09-15", 2026);
    expect(summary.activeCount).toBe(1);
    expect(summary.totalMonthly).toBe(1000);
    expect(summary.totalAnnual).toBe(12000); // só o contrato ativo conta em 2026
  });

  // Assimetria proposital de contracts-view.tsx: totalMonthly soma só os
  // ativos, mas totalAnnual soma TODOS os contratos pelos meses em que
  // estiveram ativos no ano — um contrato encerrado em jun/2026 não entra no
  // mensal, mas seus 6 meses entram no anual.
  it("totalAnnual conta os meses de um contrato já encerrado no ano corrente", () => {
    const contracts = [
      { start_date: "2026-01-01", end_date: "2026-06-30", monthly_value: 1000 },
    ];
    const summary = summarizeContracts(contracts, "2026-09-15", 2026);
    expect(summary.activeCount).toBe(0);
    expect(summary.totalMonthly).toBe(0);
    expect(summary.totalAnnual).toBe(6000);
  });
});
