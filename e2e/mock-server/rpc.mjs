// Emulação de public.commission_summary() (scripts/016_vendor_views.sql) para os E2E. Mesmas regras
// e mesma guarda de acesso; conferida contra o oráculo da Fase 1 em
// lib/calc/commission-summary-oracle.test.ts. A função real é conferida à mão (V-DB-10..12).

import { vendorScope } from "./rls.mjs";

export class RpcError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

// Padrões da #13 enquanto não houver resposta (comportamento atual do Dashboard):
// - Q2: venda compartilhada conta com o valor cheio para cada vendedor;
// - Q10a: só vendas concluídas (pagas ou não);
// - Q10b / N12: vendedor inativo com vendas entra no resultado (e no total), marcado is_active=false;
// - N13: sem arredondamento;
// - p_months nulo: nenhum filtro de data (todos os anos), como o Dashboard sem mês marcado.
export function commissionSummary(tables, ctx, { p_company_id, p_year, p_months }) {
  const company = tables.companies.find((c) => c.id === p_company_id);
  const allowed =
    ctx.kind === "service" ||
    (ctx.kind === "user" &&
      company &&
      ctx.tenantId &&
      company.user_id === ctx.tenantId &&
      (ctx.isAdmin || (ctx.isVendor && vendorScope(tables, ctx).companies.has(company.id))));
  if (!allowed) throw new RpcError("42501", "acesso negado");

  const inPeriod = (saleDate) => {
    if (p_months == null) return true;
    const [y, m] = saleDate.split("-").map(Number);
    return y === Number(p_year) && p_months.includes(m);
  };
  const sales = tables.sales.filter((s) => s.company_id === p_company_id && s.status === "concluída" && inPeriod(s.sale_date));
  const costOf = (saleId) => tables.sale_costs.filter((c) => c.sale_id === saleId).reduce((sum, c) => sum + Number(c.amount), 0);

  const agg = new Map();
  for (const sale of sales) {
    const costs = costOf(sale.id);
    const net = Number(sale.total_price) - costs;
    for (const ss of tables.sale_salespersons.filter((x) => x.sale_id === sale.id)) {
      const a = agg.get(ss.salesperson_id) ?? { sales_count: 0, total_sales: 0, total_costs: 0, net_profit: 0, total_commission: 0 };
      a.sales_count += 1;
      a.total_sales += Number(sale.total_price);
      a.total_costs += costs;
      a.net_profit += net;
      a.total_commission += (net * Number(ss.commission_percent)) / 100;
      agg.set(ss.salesperson_id, a);
    }
  }

  return tables.salespersons
    .filter((sp) => (sp.company_id === p_company_id && sp.is_active) || agg.has(sp.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sp) => {
      const a = agg.get(sp.id) ?? { sales_count: 0, total_sales: 0, total_costs: 0, net_profit: 0, total_commission: 0 };
      return { salesperson_id: sp.id, salesperson_name: sp.name, is_active: sp.is_active, ...a };
    });
}
