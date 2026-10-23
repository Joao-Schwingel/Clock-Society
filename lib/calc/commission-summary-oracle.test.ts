import { describe, expect, it } from "vitest";
import expected from "../../e2e/fixtures/expected-numbers.json";
// Emulação de public.commission_summary() (scripts/016_vendor_views.sql) usada pelo mock dos E2E.
import { commissionSummary } from "../../e2e/mock-server/rpc.mjs";
import { freshTables } from "../../e2e/mock-server/db.mjs";

// Fase 6, fatia 6.3 — V-REG-01/V-DB-12 no que dá para provar sem banco: a regra da RPC (emulada no
// mock) reproduz o oráculo da Fase 1 (C-DASH-03/04) em todos os períodos, com os padrões da #13:
// venda compartilhada com valor cheio para cada um (Q2), só concluídas, inativo entra no total mas
// sem cartão (N12), sem arredondamento (N13). A RPC real é conferida à mão no V-DB-12.

type Row = { salesperson_name: string; is_active: boolean; total_commission: number; sales_count: number };
const admin = { kind: "user", userId: "u-admin", tenantId: "u-admin", isAdmin: true, isVendor: false };
const companyIds: Record<string, string> = { A: "comp-a", B: "comp-b", C: "comp-c" };

// O oráculo marca os 12 meses para "ano inteiro"; o front manda meses 0..11 e a RPC recebe 1..12.
const toRpcMonths = (months: number[]) => (months.length === 0 ? Array.from({ length: 12 }, (_, i) => i + 1) : months.map((m) => m + 1));

describe("commission_summary × oráculo da Fase 1", () => {
  for (const [company, data] of Object.entries(expected.companies)) {
    for (const [period, p] of Object.entries(data.dashboard as Record<string, { months: number[]; year: string; comissoes: number; porVendedor: Record<string, { vendas: number; comissao: number }> }>)) {
      it(`${company} / ${period}`, () => {
        const rows: Row[] = commissionSummary(freshTables(), admin, {
          p_company_id: companyIds[company],
          p_year: Number(p.year),
          p_months: toRpcMonths(p.months),
        });
        const total = rows.reduce((s, r) => s + Number(r.total_commission), 0);
        expect(total).toBeCloseTo(p.comissoes, 9);

        const cards = rows.filter((r) => r.is_active);
        expect(cards.map((r) => r.salesperson_name).sort()).toEqual(Object.keys(p.porVendedor).sort());
        for (const card of cards) {
          const o = p.porVendedor[card.salesperson_name];
          expect(Number(card.total_commission)).toBeCloseTo(o.comissao, 9);
          expect(Number(card.sales_count)).toBe(o.vendas);
        }
      });
    }
  }

  it("p_months nulo: sem filtro de data nenhum — todos os anos (comportamento atual do Dashboard sem mês marcado)", () => {
    const all = commissionSummary(freshTables(), admin, { p_company_id: "comp-a", p_year: 2026, p_months: null });
    const y2026 = commissionSummary(freshTables(), admin, { p_company_id: "comp-a", p_year: 2026, p_months: toRpcMonths([]) });
    const y2025 = commissionSummary(freshTables(), admin, { p_company_id: "comp-a", p_year: 2025, p_months: toRpcMonths([]) });
    const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.total_commission), 0);
    expect(sum(all)).toBeCloseTo(sum(y2026) + sum(y2025), 9);
  });

  it("devolve só agregados por vendedor: exatamente as 8 colunas, sem id de venda, cliente ou produto (V-DB-10)", () => {
    const [row] = commissionSummary(freshTables(), admin, { p_company_id: "comp-a", p_year: 2026, p_months: [9] });
    expect(Object.keys(row).sort()).toEqual(
      ["is_active", "net_profit", "sales_count", "salesperson_id", "salesperson_name", "total_commission", "total_costs", "total_sales"].sort(),
    );
  });

  it("guarda de acesso: vendedor de outra empresa e admin de outro inquilino → 42501 (V-DB-11)", () => {
    const vendA = { kind: "user", userId: "u-vend-a", tenantId: "u-admin", isAdmin: false, isVendor: true };
    const outro = { kind: "user", userId: "u-outro", tenantId: "u-outro", isAdmin: true, isVendor: false };
    expect(() => commissionSummary(freshTables(), vendA, { p_company_id: "comp-b", p_year: 2026, p_months: null })).toThrow("42501");
    expect(() => commissionSummary(freshTables(), outro, { p_company_id: "comp-a", p_year: 2026, p_months: null })).toThrow("42501");
  });

  // #13, respostas de 08/10/2026 (3.1 e Q10): o vendedor vê vendas, custo e lucro líquido dos
  // colegas, mas NÃO a comissão deles; e não vê o cartão do vendedor inativo (o admin vê).
  it("V-DB-10 — vendedor: os colegas ativos aparecem com vendas, custo e lucro, mas comissão nula; a própria comissão aparece", () => {
    const vendA = { kind: "user", userId: "u-vend-a", tenantId: "u-admin", isAdmin: false, isVendor: true };
    const args = { p_company_id: "comp-a", p_year: 2026, p_months: [9] };
    const asAdmin = commissionSummary(freshTables(), admin, args) as Row[] & { salesperson_id: string }[];
    const asVendor = commissionSummary(freshTables(), vendA, args) as Array<Row & Record<string, unknown>>;

    // sem o inativo (Elis); os ativos são os mesmos do admin
    expect(asVendor.map((r) => r.salesperson_name)).toEqual(asAdmin.filter((r) => r.is_active).map((r) => r.salesperson_name));
    for (const row of asVendor) {
      const same = (asAdmin as Array<Row & Record<string, unknown>>).find((r) => r.salesperson_name === row.salesperson_name)!;
      expect([row.sales_count, row.total_sales, row.total_costs, row.net_profit]).toEqual([
        same.sales_count,
        same.total_sales,
        same.total_costs,
        same.net_profit,
      ]);
      expect(row.total_commission).toBe(row.salesperson_name === "Ana" ? same.total_commission : null);
    }
  });

  it("Q10 — o admin recebe o vendedor inativo com is_active = false (o cartão aparece com a etiqueta INATIVO)", () => {
    const rows = commissionSummary(freshTables(), admin, { p_company_id: "comp-a", p_year: 2026, p_months: [9] }) as Row[];
    expect(rows.find((r) => r.salesperson_name === "Elis")).toMatchObject({ is_active: false, total_commission: 20 });
  });
});
