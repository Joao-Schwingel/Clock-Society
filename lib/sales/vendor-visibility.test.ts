import { describe, expect, it } from "vitest";
import { freshTables } from "../../e2e/mock-server/db.mjs";
import { rowAllowed } from "../../e2e/mock-server/rls.mjs";
import { vendorSales } from "../../e2e/mock-server/views.mjs";

// Fase 6 — decisões da #13 (08/10/2026) sobre o que o vendedor vê de uma venda, no mock dos E2E
// (a regra real está na 016/020 e é conferida à mão: V-DB-03, V-DB-09, V-DB-17).

const vendA = { kind: "user", userId: "u-vend-a", tenantId: "u-admin", isAdmin: false, isVendor: true };
type Row = Record<string, string | number | null>;
const tables = () => freshTables() as unknown as Record<string, Row[]>;

describe("o que o vendedor vê de uma venda", () => {
  it("3.1 — vendor_sales traz os nomes de todos os vendedores da venda, com o % só do próprio", () => {
    const shared = (vendorSales(tables(), vendA) as Array<Row & { salespersons: unknown }>).find((s) => s.id === "sale-a-03")!;
    expect(shared.salespersons).toEqual([
      { id: "sp-ana-a", name: "Ana", commission_percent: 10 },
      { id: "sp-bruno-a", name: "Bruno", commission_percent: null },
    ]);
  });

  it("V-DB-17 — na tabela sale_salespersons continua lendo só as próprias linhas", () => {
    const t = tables();
    const rows = t.sale_salespersons.filter((r) => r.sale_id === "sale-a-03");
    expect(rows.filter((r) => rowAllowed(t, vendA, "sale_salespersons", r)).map((r) => r.salesperson_id)).toEqual([
      "sp-ana-a",
    ]);
  });

  it("3.9 — lê os custos das vendas em que consta (detalhe com custos, só leitura) e só delas", () => {
    const t = tables();
    const visible = t.sale_costs.filter((c) => rowAllowed(t, vendA, "sale_costs", c));
    const mySales = new Set(t.sale_salespersons.filter((r) => r.salesperson_id === "sp-ana-a").map((r) => r.sale_id));
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((c) => mySales.has(c.sale_id))).toBe(true);
    expect(t.sale_costs.filter((c) => mySales.has(c.sale_id))).toHaveLength(visible.length);
  });
});
