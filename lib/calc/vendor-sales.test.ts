import { describe, expect, it } from "vitest";
import { ownCommission, vendorSalesStats } from "./vendor-sales";

// Fase 6, fatia 6.8 — V-UI-05: cartões da aba Vendas do vendedor.
describe("vendorSalesStats", () => {
  it("conta e soma só as vendas concluídas (mesma base da comissão — #13, Q10)", () => {
    expect(
      vendorSalesStats([
        { status: "concluída", total_price: 100 },
        { status: "concluída", total_price: "50.5" },
        { status: "pendente", total_price: 999 },
      ]),
    ).toEqual({ completedCount: 2, completedTotal: 150.5, pendingCount: 1 });
  });
});

describe("ownCommission", () => {
  it("a comissão do período é a linha do próprio vendedor na RPC (as dos colegas vêm nulas)", () => {
    expect(ownCommission([{ total_commission: 38 }, { total_commission: null }, { total_commission: null }])).toBe(38);
    expect(ownCommission([])).toBe(0);
  });
});
