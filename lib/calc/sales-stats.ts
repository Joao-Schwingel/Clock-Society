// Extraído mecanicamente de components/dashboard/sales-view.tsx:514-545 (spec Fase 1 §5).

export type SalesStatsInput = {
  status: "pendente" | "concluída";
  total_price: number;
  total_costs?: number | null;
  quantity: number;
  payment_status?: "pendente" | "pago" | null;
  entry_value?: number | null;
};

export type SalesStats = {
  completedCount: number;
  pendingCount: number;
  completedRevenue: number;
  pendingRevenue: number;
  completedCosts: number;
  pendingCosts: number;
  completedNetProfit: number;
  pendingNetProfit: number;
  completedItemsCount: number;
  pendingItemsCount: number;
  paymentsCompletedCount: number;
  paymentsPendingCount: number;
  totalMissingPayments: number;
};

export function summarizeSalesStats(sales: SalesStatsInput[]): SalesStats {
  const completedSales = sales.filter((s) => s.status === "concluída");
  const pendingSales = sales.filter((s) => s.status === "pendente");

  const completedRevenue = completedSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );
  const pendingRevenue = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );

  const completedCosts = completedSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );
  const pendingCosts = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );

  const completedNetProfit = completedRevenue - completedCosts;
  const pendingNetProfit = pendingRevenue - pendingCosts;

  const paymentsCompleted = sales.filter((s) => s.payment_status === "pago");
  const paymentsPending = sales.filter((s) => s.payment_status !== "pago");

  const totalMissingPayments = paymentsPending.reduce((sum, s) => {
    const total = Number(s.total_price ?? 0);
    const entry = Number(s.entry_value ?? 0);
    return sum + Math.max(total - entry, 0);
  }, 0);

  return {
    completedCount: completedSales.length,
    pendingCount: pendingSales.length,
    completedRevenue,
    pendingRevenue,
    completedCosts,
    pendingCosts,
    completedNetProfit,
    pendingNetProfit,
    completedItemsCount: completedSales.reduce((sum, sale) => sum + sale.quantity, 0),
    pendingItemsCount: pendingSales.reduce((sum, sale) => sum + sale.quantity, 0),
    paymentsCompletedCount: paymentsCompleted.length,
    paymentsPendingCount: paymentsPending.length,
    totalMissingPayments,
  };
}
