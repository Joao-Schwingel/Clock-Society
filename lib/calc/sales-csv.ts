// Extraído mecanicamente de components/dashboard/sales-view.tsx:419-489 (handleExport),
// spec Fase 1 §5.

import { formatBR } from "@/lib/utils";

export type SalesCsvRowInput = {
  id: string;
  sale_date: string | null;
  order_number: string | number | null;
  customer_name: string | null;
  status: "pendente" | "concluída";
  quantity: number;
  product_name: string | null;
  total_price: number | null;
  total_costs?: number | null;
  entry_value?: number | null;
  payment_status?: "pendente" | "pago" | null;
  salespersons?: { name: string; commission_percent: number }[] | null;
};

export const SALES_CSV_HEADERS = [
  "Data",
  "Nº Pedido",
  "Produtos",
  "Cliente",
  "Vendedor",
  "Status",
  "Quantidade",
  "Valor do Produto",
  "Custo Total",
  "Valor Líquido",
  "Valor Líquido após Comissão",
  "Entrada",
  "Faltante",
  "Status Pagamento",
];

const formatMoney = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const escapeCSV = (val: unknown): string => {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function buildSalesCsvRow(
  sale: SalesCsvRowInput,
  qtyMap: Record<string, number>,
  productMap: Record<string, string>,
): string[] {
  const costs = Number(sale.total_costs ?? 0);
  const total = Number(sale.total_price ?? 0);
  const entry = Number(sale.entry_value ?? 0);
  const paymentStatus = sale.payment_status ?? "pendente";
  const remaining = paymentStatus === "pago" ? 0 : Math.max(0, total - entry);
  const qty = qtyMap[sale.id] ?? sale.quantity ?? 0;
  const products = productMap[sale.id] || sale.product_name || "-";
  const salespersons = (sale.salespersons ?? []).map((p) => p.name).join(", ");

  const netValue = total - costs;
  const totalCommission = (sale.salespersons ?? []).reduce(
    (sum, p) => sum + (netValue * Number(p.commission_percent || 0)) / 100,
    0,
  );
  const netAfterCommission = netValue - totalCommission;

  return [
    sale.sale_date ? formatBR(sale.sale_date) : "-",
    sale.order_number || "-",
    products,
    sale.customer_name || "-",
    salespersons || "-",
    sale.status === "concluída" ? "Concluída" : "Pendente",
    String(qty),
    formatMoney(total),
    formatMoney(costs),
    formatMoney(netValue),
    formatMoney(netAfterCommission),
    entry > 0 ? formatMoney(entry) : "-",
    formatMoney(remaining),
    paymentStatus === "pago" ? "Pago" : "Pendente",
  ].map(escapeCSV);
}

// Conteúdo completo do CSV (BOM + cabeçalho + linhas). C-SALES-10.
export function buildSalesCsvContent(
  sales: SalesCsvRowInput[],
  qtyMap: Record<string, number>,
  productMap: Record<string, string>,
): string {
  const rows = sales.map((sale) => buildSalesCsvRow(sale, qtyMap, productMap));
  return (
    "﻿" +
    [SALES_CSV_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n")
  );
}
