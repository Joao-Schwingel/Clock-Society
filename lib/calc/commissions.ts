// Comissões por vendedor a partir de public.commission_summary() (scripts/016_vendor_views.sql).
// Fase 6, fatia 6.4: o cálculo saiu do navegador; a regra (#13) vive só na RPC.

export interface CommissionRow {
  salesperson_id: string;
  salesperson_name: string;
  is_active: boolean;
  sales_count: number;
  total_sales: number;
  total_costs: number;
  net_profit: number;
  /** Nula para o vendedor quando a linha é de um colega (#13, 3.1). */
  total_commission: number | null;
}

// O filtro de meses usa 0..11; a RPC, 1..12. Sem mês marcado → null (sem filtro de data).
export function toRpcMonths(months: number[]): number[] | null {
  return months.length === 0 ? null : months.map((m) => m + 1);
}

// Total de comissões da empresa: soma todas as linhas, inclusive a do inativo (N12).
export function totalCommission(rows: Array<Pick<CommissionRow, "total_commission" | "is_active">>): number {
  return rows.reduce((sum, r) => sum + Number(r.total_commission ?? 0), 0);
}
