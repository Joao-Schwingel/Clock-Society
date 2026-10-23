import { describe, expect, it } from "vitest";
import {
  exportMonthRangesFilter,
  salespersonContainsFilter,
  searchOrFilter,
  tableMonthRange,
} from "./sales-filters";

// Fase 6, fatia 6.1: filtros extraídos de sales-view.tsx SEM mudar a lógica (Fase 1 §5, regra 1).
// Os valores esperados descrevem o comportamento de antes da extração. TZ=America/Sao_Paulo.

describe("searchOrFilter", () => {
  it("texto: cliente ou produto, sem diferenciar maiúsculas (ilike)", () => {
    expect(searchOrFilter("Camiseta")).toBe("customer_name.ilike.%Camiseta%,product_name.ilike.%Camiseta%");
  });

  it("número: também procura o nº do pedido exato", () => {
    expect(searchOrFilter("1005")).toBe(
      "customer_name.ilike.%1005%,product_name.ilike.%1005%,order_number.eq.1005",
    );
  });

  it("tira os espaços das pontas; vazio → sem filtro", () => {
    expect(searchOrFilter("  Ana  ")).toBe("customer_name.ilike.%Ana%,product_name.ilike.%Ana%");
    expect(searchOrFilter("   ")).toBeNull();
    expect(searchOrFilter("")).toBeNull();
  });
});

describe("tableMonthRange (filtro de mês da tabela, AAAA-MM)", () => {
  it("do dia 1 do mês até o dia 1 do mês seguinte (exclusivo)", () => {
    expect(tableMonthRange("2026-09")).toEqual({ gte: "2026-09-01", lt: "2026-10-01" });
  });

  it("dezembro vira o ano", () => {
    expect(tableMonthRange("2025-12")).toEqual({ gte: "2025-12-01", lt: "2026-01-01" });
  });

  it("vazio → sem filtro", () => {
    expect(tableMonthRange("")).toBeNull();
  });
});

describe("exportMonthRangesFilter (filtro de meses do topo, usado só na exportação)", () => {
  it("um intervalo por mês, em timestamps ISO (meses 0..11)", () => {
    expect(exportMonthRangesFilter([8], "2026")).toBe(
      "and(sale_date.gte.2026-09-01T03:00:00.000Z,sale_date.lt.2026-10-01T03:00:00.000Z)",
    );
  });

  it("vários meses viram um or()", () => {
    expect(exportMonthRangesFilter([0, 2], "2026")).toBe(
      "and(sale_date.gte.2026-01-01T03:00:00.000Z,sale_date.lt.2026-02-01T03:00:00.000Z)," +
        "and(sale_date.gte.2026-03-01T03:00:00.000Z,sale_date.lt.2026-04-01T03:00:00.000Z)",
    );
  });

  it("nenhum mês → sem filtro", () => {
    expect(exportMonthRangesFilter([], "2026")).toBeNull();
  });
});

describe("salespersonContainsFilter (§7.5: filtro na própria view, sem a 2ª consulta)", () => {
  it("salespersons (jsonb) contém o vendedor", () => {
    expect(salespersonContainsFilter("sp-ana-a")).toEqual(["salespersons", "cs", '[{"id":"sp-ana-a"}]']);
  });
});
