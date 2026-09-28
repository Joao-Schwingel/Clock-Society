import { describe, expect, it } from "vitest";
import { filterAndSortFixedCosts, type FixedCostTableFilters } from "./fixed-cost-table";
import type { FixedCost } from "@/lib/types";

const baseFilters: FixedCostTableFilters = {
  searchTerm: "",
  categoryFilter: "all",
  dateFilter: "",
  saleType: "ambos",
  sortDirection: "desc",
};

function makeCost(overrides: Partial<FixedCost>): FixedCost {
  return {
    id: overrides.id ?? "id",
    company_id: "c1",
    user_id: "u1",
    name: "Custo",
    category: "Fixo",
    monthly_value: 100,
    qtdmonths: 1,
    start_date: "2026-01-01",
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// C-FIX-02
describe("filterAndSortFixedCosts", () => {
  it("busca por nome ou categoria (case-insensitive)", () => {
    const costs = [
      makeCost({ id: "1", name: "Aluguel", category: "Fixo" }),
      makeCost({ id: "2", name: "Internet", category: "Variável" }),
    ];
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, searchTerm: "aluguel" }).map((c) => c.id),
    ).toEqual(["1"]);
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, searchTerm: "variável" }).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("filtra por mês em que o custo está ativo", () => {
    const costs = [
      makeCost({ id: "1", start_date: "2026-01-01", qtdmonths: 3 }), // jan-mar
      makeCost({ id: "2", start_date: "2026-06-01", qtdmonths: 1 }), // jun
    ];
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, dateFilter: "2026-02" }).map((c) => c.id),
    ).toEqual(["1"]);
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, dateFilter: "2026-06" }).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("filtra por tipo Fixo/Variável", () => {
    const costs = [
      makeCost({ id: "1", category: "Fixo" }),
      makeCost({ id: "2", category: "Variável" }),
    ];
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, saleType: "fixo" }).map((c) => c.id),
    ).toEqual(["1"]);
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, saleType: "variável" }).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("ordena por data de início, ascendente ou descendente", () => {
    const costs = [
      makeCost({ id: "old", start_date: "2026-01-01" }),
      makeCost({ id: "new", start_date: "2026-06-01" }),
    ];
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, sortDirection: "asc" }).map((c) => c.id),
    ).toEqual(["old", "new"]);
    expect(
      filterAndSortFixedCosts(costs, { ...baseFilters, sortDirection: "desc" }).map((c) => c.id),
    ).toEqual(["new", "old"]);
  });
});
