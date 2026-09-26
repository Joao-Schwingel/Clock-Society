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
});
