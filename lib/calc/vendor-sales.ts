// Cartões da aba Vendas do vendedor (Fase 6, fatia 6.8; V-UI-05).

// Nº e valor das vendas concluídas no período (a comissão gira em torno da venda concluída — #13).
export function vendorSalesStats(sales: Array<{ status: string; total_price: number | string }>) {
  const completed = sales.filter((s) => s.status === "concluída");
  return {
    completedCount: completed.length,
    completedTotal: completed.reduce((sum, s) => sum + Number(s.total_price), 0),
    pendingCount: sales.length - completed.length,
  };
}

// Comissão do período: vem da linha do próprio vendedor em commission_summary() — a RPC devolve
// nula a comissão dos colegas (#13, 3.1), então a soma dos valores não nulos é a dele (3.3, N9).
export function ownCommission(rows: Array<{ total_commission: number | null }>): number {
  return rows.reduce((sum, r) => sum + Number(r.total_commission ?? 0), 0);
}
