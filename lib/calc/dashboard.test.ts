import { describe, expect, it } from "vitest";
import {
  sumFixedCostsForPeriod,
  summarizeCommissionsBySalesperson,
} from "./dashboard";

// C-DASH-01
describe("sumFixedCostsForPeriod", () => {
  it("conta o mês quando ele está entre start_date e start_date + qtdmonths - 1", () => {
    const costs = [{ monthly_value: 100, start_date: "2026-01-01", qtdmonths: 3 }];
    // ativo em jan(0), fev(1), mar(2); não em abr(3)
    expect(sumFixedCostsForPeriod(costs, [0], "2026")).toBe(100);
    expect(sumFixedCostsForPeriod(costs, [2], "2026")).toBe(100);
    expect(sumFixedCostsForPeriod(costs, [3], "2026")).toBe(0);
  });

  it("sem mês selecionado, considera os 12 meses do ano selecionado", () => {
    const costs = [{ monthly_value: 100, start_date: "2026-01-01", qtdmonths: 3 }];
    expect(sumFixedCostsForPeriod(costs, [], "2026")).toBe(300);
  });

  it("valor negativo reduz o total", () => {
    const costs = [
      { monthly_value: 500, start_date: "2026-01-01", qtdmonths: 12 },
      { monthly_value: -100, start_date: "2026-01-01", qtdmonths: 12 },
    ];
    expect(sumFixedCostsForPeriod(costs, [0], "2026")).toBe(400);
  });

  it("custo que atravessa a virada do ano conta só os meses do ano filtrado", () => {
    // ativo de nov/2025 a fev/2026 (4 meses)
    const costs = [{ monthly_value: 100, start_date: "2025-11-01", qtdmonths: 4 }];
    expect(sumFixedCostsForPeriod(costs, [], "2025")).toBe(200); // nov, dez
    expect(sumFixedCostsForPeriod(costs, [], "2026")).toBe(200); // jan, fev
  });
});

// C-DASH-02
describe("summarizeCommissionsBySalesperson", () => {
  it("comissão = (total - custos da venda) × % ÷ 100", () => {
    const sales = [
      {
        id: "s1",
        total_price: 1000,
        salespersons: [{ id: "sp1", name: "Ana", commission_percent: 10 }],
      },
    ];
    const { summaries, totalCommission } = summarizeCommissionsBySalesperson(sales, {
      s1: 200,
    });
    expect(summaries).toEqual([
      {
        id: "sp1",
        name: "Ana",
        salesCount: 1,
        totalSales: 1000,
        totalCosts: 200,
        netProfit: 800,
        totalCommission: 80,
      },
    ]);
    expect(totalCommission).toBe(80);
  });

  it("venda com dois vendedores soma o valor cheio da venda para cada um (achado 9)", () => {
    const sales = [
      {
        id: "s1",
        total_price: 1000,
        salespersons: [
          { id: "sp1", name: "Ana", commission_percent: 10 },
          { id: "sp2", name: "Bia", commission_percent: 10 },
        ],
      },
    ];
    const { summaries } = summarizeCommissionsBySalesperson(sales, {});
    const ana = summaries.find((s) => s.id === "sp1")!;
    const bia = summaries.find((s) => s.id === "sp2")!;
    expect(ana.totalSales).toBe(1000);
    expect(bia.totalSales).toBe(1000);
  });

  it("vendedor inativo entra no total, pois a função não filtra por atividade (N12)", () => {
    // A função recebe apenas as vendas já embutidas com seus vendedores (view);
    // quem decide se um vendedor "aparece" na lista de cards é outra query
    // (salespersons com is_active=true). Aqui, uma venda de um vendedor que hoje
    // está inativo ainda soma no total geral de comissões.
    const sales = [
      {
        id: "s1",
        total_price: 500,
        salespersons: [{ id: "sp-inativo", name: "Vendedor Inativo", commission_percent: 20 }],
      },
    ];
    const { totalCommission } = summarizeCommissionsBySalesperson(sales, {});
    expect(totalCommission).toBe(100);
  });
});
