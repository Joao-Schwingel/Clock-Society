import { describe, expect, it } from "vitest";
import { buildSaleDateRangeFilter } from "./date-filters";

// C-DASH-05
describe("buildSaleDateRangeFilter", () => {
  it("sem meses selecionados, retorna null (sem filtro)", () => {
    expect(buildSaleDateRangeFilter([], "2026")).toBeNull();
  });

  it("um mês selecionado gera um intervalo incluindo o dia 1 e nada do mês vizinho", () => {
    const start = new Date(2026, 0, 1).toISOString();
    const end = new Date(2026, 1, 1).toISOString();
    expect(buildSaleDateRangeFilter([0], "2026")).toBe(
      `and(sale_date.gte.${start},sale_date.lt.${end})`,
    );
  });

  it("dezembro usa janeiro do ano seguinte como limite superior (virada do ano)", () => {
    const start = new Date(2026, 11, 1).toISOString();
    const end = new Date(2027, 0, 1).toISOString();
    expect(buildSaleDateRangeFilter([11], "2026")).toBe(
      `and(sale_date.gte.${start},sale_date.lt.${end})`,
    );
  });

  it("vários meses são unidos por vírgula (OR)", () => {
    const result = buildSaleDateRangeFilter([0, 2], "2026");
    expect(result).toContain(",");
    expect(result?.split(",and(").length).toBeGreaterThan(1);
  });
});
