import { describe, expect, it } from "vitest";
import { summarizeSalesStats, type SalesStatsInput } from "./sales-stats";

// C-SALES-01
describe("summarizeSalesStats", () => {
  const sales: SalesStatsInput[] = [
    {
      status: "concluída",
      total_price: 1000,
      total_costs: 100,
      quantity: 3,
      payment_status: "pago",
      entry_value: 1000,
    },
    {
      status: "concluída",
      total_price: 500,
      total_costs: 0,
      quantity: 2,
      payment_status: "pago",
      entry_value: 500,
    },
    {
      status: "pendente",
      total_price: 300,
      total_costs: 50,
      quantity: 1,
      payment_status: "pendente",
      entry_value: 100,
    },
    {
      status: "pendente",
      total_price: 200,
      total_costs: 0,
      quantity: 4,
      payment_status: "pendente",
      entry_value: 0,
    },
  ];

  it("separa receita, custos e lucro de vendas concluídas e pendentes", () => {
    const stats = summarizeSalesStats(sales);
    expect(stats.completedCount).toBe(2);
    expect(stats.pendingCount).toBe(2);
    expect(stats.completedRevenue).toBe(1500);
    expect(stats.pendingRevenue).toBe(500);
    expect(stats.completedCosts).toBe(100);
    expect(stats.pendingCosts).toBe(50);
    expect(stats.completedNetProfit).toBe(1400);
    expect(stats.pendingNetProfit).toBe(450);
  });

  it("soma os itens (quantity) de vendas concluídas e pendentes", () => {
    const stats = summarizeSalesStats(sales);
    expect(stats.completedItemsCount).toBe(5);
    expect(stats.pendingItemsCount).toBe(5);
  });

  it("conta pagamentos concluídos e pendentes", () => {
    const stats = summarizeSalesStats(sales);
    expect(stats.paymentsCompletedCount).toBe(2);
    expect(stats.paymentsPendingCount).toBe(2);
  });

  it("valor faltante: max(total - entrada, 0) para pagamentos não pagos", () => {
    const stats = summarizeSalesStats(sales);
    // pendente 1: 300 - 100 = 200; pendente 2: 200 - 0 = 200
    expect(stats.totalMissingPayments).toBe(400);
  });

  it("entrada maior que o total nunca gera faltante negativo", () => {
    const stats = summarizeSalesStats([
      {
        status: "pendente",
        total_price: 100,
        quantity: 1,
        payment_status: "pendente",
        entry_value: 150,
      },
    ]);
    expect(stats.totalMissingPayments).toBe(0);
  });
});
