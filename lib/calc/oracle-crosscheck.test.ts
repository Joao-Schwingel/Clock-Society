// Cruzamento do oráculo (e2e/fixtures/expected-numbers.json) com lib/calc.
//
// O oráculo é calculado À MÃO a partir das regras da spec (§4) — de propósito,
// para não ser derivado do código. O risco disso é erro de transcrição: um
// número errado no oráculo só apareceria se algum teste o comparasse com a
// implementação.
//
// As seções `dashboard` e `inventory` já são verificadas pelos testes E2E
// (dashboard.spec.ts, inventory.spec.ts). As seções `salesTab`, `fixedCosts` e
// `contracts` não eram lidas por nenhum teste: os specs correspondentes
// (sales/fixed-costs/contracts) afirmam números literais inline. Este arquivo
// fecha essa lacuna no nível unitário — barato e sem navegador.
//
// Um desacordo aqui significa que o oráculo OU lib/calc está errado; os dois
// precisam ser conferidos à mão antes de mexer no número.

import { describe, expect, it } from "vitest";
import { summarizeContracts } from "./contracts";
import {
  sumActiveFixedCostsInMonth,
  sumFixedCostsAnnualTotal,
} from "./fixed-costs";
import { summarizeSalesStats, type SalesStatsInput } from "./sales-stats";

import companies from "@/e2e/fixtures/companies.json";
import contractsFixture from "@/e2e/fixtures/contracts.json";
import expected from "@/e2e/fixtures/expected-numbers.json";
import fixedCostsFixture from "@/e2e/fixtures/fixed_costs.json";
import saleCostsFixture from "@/e2e/fixtures/sale_costs.json";
import salesFixture from "@/e2e/fixtures/sales.json";

// Cada chave de filtro do oráculo → (ano, meses 0-based), como o seletor do
// dashboard os envia. "inteiro" = os 12 meses marcados explicitamente: com
// months=[] o app não filtra por ano nenhum (achado já documentado em
// dashboard.spec.ts), então "ano inteiro" só existe marcando mês a mês.
const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const FILTERS: Record<string, { year: number; months: number[] }> = {
  "2026-inteiro": { year: 2026, months: ALL_MONTHS },
  "2026-09": { year: 2026, months: [8] },
  "2026-01+03": { year: 2026, months: [0, 2] },
  "2026-07-sem-vendas": { year: 2026, months: [6] },
  "2025-inteiro": { year: 2025, months: ALL_MONTHS },
};

const COMPANY_IDS: Record<string, string> = {
  A: "comp-a",
  B: "comp-b",
  C: "comp-c",
};

// total_costs vem da view sales_with_details (soma de sale_costs por venda),
// não da tabela sales — espelha scripts/views/sales_with_details.sql.
function totalCostsForSale(saleId: string): number {
  return saleCostsFixture
    .filter((c) => c.sale_id === saleId)
    .reduce((sum, c) => sum + Number(c.amount), 0);
}

// Filtro de período aplicado sobre as partes da data (YYYY-MM-DD), derivado das
// regras da spec — não da string `.or()` que o app monta para o PostgREST.
function salesFor(companyId: string, year: number, months: number[]): SalesStatsInput[] {
  return salesFixture
    .filter((s) => s.company_id === companyId)
    .filter((s) => {
      const [sy, sm] = s.sale_date.split("-").map(Number);
      return sy === year && months.includes(sm - 1);
    })
    .map((s) => ({
      status: s.status as SalesStatsInput["status"],
      total_price: s.total_price,
      total_costs: totalCostsForSale(s.id),
      quantity: s.quantity,
      payment_status: s.payment_status as SalesStatsInput["payment_status"],
      entry_value: s.entry_value,
    }));
}

describe("oráculo × lib/calc: aba Vendas (salesTab)", () => {
  for (const [code, companyId] of Object.entries(COMPANY_IDS)) {
    const salesTab = (expected.companies as Record<string, any>)[code].salesTab as
      | Record<string, Record<string, number>>
      | undefined;
    if (!salesTab) continue;

    for (const [filterKey, oracle] of Object.entries(salesTab)) {
      it(`empresa ${code} / ${filterKey}`, () => {
        const filter = FILTERS[filterKey];
        expect(filter, `filtro desconhecido no oráculo: ${filterKey}`).toBeDefined();

        const stats = summarizeSalesStats(
          salesFor(companyId, filter.year, filter.months),
        );

        // Compara só as chaves que o oráculo declara, para que acrescentar um
        // campo em SalesStats não quebre o cruzamento.
        for (const [key, value] of Object.entries(oracle)) {
          if (key.startsWith("_")) continue;
          expect(
            stats[key as keyof typeof stats],
            `${code}/${filterKey}.${key}`,
          ).toBeCloseTo(value, 6);
        }
      });
    }
  }
});

describe("oráculo × lib/calc: Custos Fixos (fixedCosts)", () => {
  // "mês corrente" e "ano corrente" do relógio fixo da suíte: set/2026.
  const CURRENT_YEAR = 2026;
  const CURRENT_YEAR_MONTH = CURRENT_YEAR * 12 + 8; // setembro (0-based)

  for (const [code, companyId] of Object.entries(COMPANY_IDS)) {
    const oracle = (expected.companies as Record<string, any>)[code].fixedCosts as
      | { totalMonthlyAtCurrentMonth: number; totalAnnualCurrentYear: number; count: number }
      | undefined;
    if (!oracle) continue;

    it(`empresa ${code}`, () => {
      const costs = fixedCostsFixture.filter((c) => c.company_id === companyId);

      expect(costs.length, `${code}.count`).toBe(oracle.count);
      expect(
        sumActiveFixedCostsInMonth(costs, CURRENT_YEAR_MONTH),
        `${code}.totalMonthlyAtCurrentMonth`,
      ).toBeCloseTo(oracle.totalMonthlyAtCurrentMonth, 6);
      expect(
        sumFixedCostsAnnualTotal(costs, CURRENT_YEAR),
        `${code}.totalAnnualCurrentYear`,
      ).toBeCloseTo(oracle.totalAnnualCurrentYear, 6);
    });
  }
});

describe("oráculo × lib/calc: Contratos", () => {
  it("totalMonthly, activeCount e totalAnnualCurrentYear", () => {
    const oracle = expected.contracts;
    const summary = summarizeContracts(
      contractsFixture,
      oracle.hoje,
      oracle.currentYear,
    );

    expect(summary.totalMonthly).toBeCloseTo(oracle.totalMonthly, 6);
    expect(summary.activeCount).toBe(oracle.activeCount);
    expect(summary.totalAnnual).toBeCloseTo(oracle.totalAnnualCurrentYear, 6);
    // endedCount não é retornado por summarizeContracts; é o complemento.
    expect(contractsFixture.length - summary.activeCount).toBe(oracle.endedCount);
  });
});

// Guarda contra o oráculo e as empresas saírem de sincronia com o fixture.
describe("sanidade do fixture", () => {
  it("as empresas A/B/C do oráculo existem em companies.json", () => {
    for (const [code, companyId] of Object.entries(COMPANY_IDS)) {
      const row = companies.find((c) => c.id === companyId);
      expect(row, `empresa ${code} (${companyId})`).toBeDefined();
      expect(row!.code).toBe(code);
      expect(row!.name).toBe((expected.companies as Record<string, any>)[code].name);
    }
  });
});
