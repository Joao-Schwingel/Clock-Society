import { describe, expect, it } from "vitest";
import { buildSaleDateRangeFilter } from "./date-filters";

// C-DASH-05
//
// As strings esperadas são LITERAIS de propósito. Antes elas eram montadas com
// o mesmo `new Date(y, m, 1).toISOString()` que a implementação usa, então os
// dois lados se moviam juntos: o teste passava igual em UTC-3, UTC e UTC+9 e
// passaria até se o `env.TZ` do vitest.config.ts deixasse de valer — ou seja,
// não verificava nada do limite de fuso que é justamente o assunto do C-DASH-05.
//
// O offset -03:00 (São Paulo, sem horário de verão desde 2019) fica visível no
// `T03:00:00.000Z`: é isso que faz o dia 1 local entrar no intervalo.
describe("buildSaleDateRangeFilter", () => {
  // Se este teste falhar, o relógio/fuso da suíte mudou e todos os literais
  // abaixo precisam ser reconferidos à mão — não atualizados no piloto automático.
  it("a suíte roda em America/Sao_Paulo (-03:00)", () => {
    expect(new Date(2026, 0, 1).toISOString()).toBe("2026-01-01T03:00:00.000Z");
  });

  it("sem meses selecionados, retorna null (sem filtro)", () => {
    expect(buildSaleDateRangeFilter([], "2026")).toBeNull();
  });

  it("um mês selecionado gera um intervalo incluindo o dia 1 e nada do mês vizinho", () => {
    expect(buildSaleDateRangeFilter([0], "2026")).toBe(
      "and(sale_date.gte.2026-01-01T03:00:00.000Z,sale_date.lt.2026-02-01T03:00:00.000Z)",
    );
  });

  it("dezembro usa janeiro do ano seguinte como limite superior (virada do ano)", () => {
    expect(buildSaleDateRangeFilter([11], "2026")).toBe(
      "and(sale_date.gte.2026-12-01T03:00:00.000Z,sale_date.lt.2027-01-01T03:00:00.000Z)",
    );
  });

  it("vários meses são unidos por vírgula (OR), na ordem recebida", () => {
    expect(buildSaleDateRangeFilter([0, 2], "2026")).toBe(
      "and(sale_date.gte.2026-01-01T03:00:00.000Z,sale_date.lt.2026-02-01T03:00:00.000Z)," +
        "and(sale_date.gte.2026-03-01T03:00:00.000Z,sale_date.lt.2026-04-01T03:00:00.000Z)",
    );
  });
});
