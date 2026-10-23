import { describe, expect, it } from "vitest";
import {
  getFixedCostMonthsInYear,
  isFixedCostActiveInMonth,
  sumActiveFixedCostsInMonth,
  sumFixedCostsAnnualTotal,
} from "./fixed-costs";

const ym = (year: number, month0: number) => year * 12 + month0;

// C-FIX-01
describe("isFixedCostActiveInMonth", () => {
  it("ativo entre start_date e start_date + qtdmonths - 1", () => {
    const cost = { start_date: "2026-03-01", qtdmonths: 3 }; // mar, abr, mai
    expect(isFixedCostActiveInMonth(cost, ym(2026, 1))).toBe(false); // fev
    expect(isFixedCostActiveInMonth(cost, ym(2026, 2))).toBe(true); // mar
    expect(isFixedCostActiveInMonth(cost, ym(2026, 4))).toBe(true); // mai
    expect(isFixedCostActiveInMonth(cost, ym(2026, 5))).toBe(false); // jun
  });
});

describe("sumActiveFixedCostsInMonth (Total Mensal Médio)", () => {
  it("soma apenas os custos ativos no mês informado", () => {
    const costs = [
      { start_date: "2026-01-01", qtdmonths: 12, monthly_value: 100 },
      { start_date: "2026-06-01", qtdmonths: 1, monthly_value: 50 },
    ];
    expect(sumActiveFixedCostsInMonth(costs, ym(2026, 5))).toBe(150); // jun: ambos ativos
    expect(sumActiveFixedCostsInMonth(costs, ym(2026, 6))).toBe(100); // jul: só o primeiro
  });
});

describe("getFixedCostMonthsInYear / sumFixedCostsAnnualTotal (Total Anual)", () => {
  it("conta os meses ativos dentro do ano informado", () => {
    const cost = { start_date: "2025-11-01", qtdmonths: 4 }; // nov/2025..fev/2026
    expect(getFixedCostMonthsInYear(cost, 2025)).toBe(2); // nov, dez
    expect(getFixedCostMonthsInYear(cost, 2026)).toBe(2); // jan, fev
  });

  it("total anual = valor × meses ativos no ano", () => {
    const costs = [
      { start_date: "2026-01-01", qtdmonths: 12, monthly_value: 100 },
      { start_date: "2025-11-01", qtdmonths: 4, monthly_value: 50 },
    ];
    // custo 1: 12 meses × 100 = 1200; custo 2 em 2026: 2 meses × 50 = 100
    expect(sumFixedCostsAnnualTotal(costs, 2026)).toBe(1300);
  });
});
