import { describe, expect, it } from "vitest";
import { toRpcMonths, totalCommission } from "./commissions";

// Fase 6, fatia 6.4: o Dashboard e a área do vendedor passam a usar commission_summary().
describe("toRpcMonths", () => {
  it("converte os meses do filtro (0..11) para os da RPC (1..12)", () => {
    expect(toRpcMonths([0, 8, 11])).toEqual([1, 9, 12]);
  });

  it("nenhum mês marcado → null (a RPC não filtra data, como o Dashboard de hoje)", () => {
    expect(toRpcMonths([])).toBeNull();
  });
});

describe("totalCommission", () => {
  it("soma todas as linhas, inclusive a do vendedor inativo (N12)", () => {
    expect(
      totalCommission([
        { total_commission: 38, is_active: true },
        { total_commission: 20, is_active: false },
      ]),
    ).toBe(58);
  });

  it("ignora as comissões nulas (colegas vistos pelo vendedor)", () => {
    expect(totalCommission([{ total_commission: 10, is_active: true }, { total_commission: null, is_active: true }])).toBe(10);
  });
});
