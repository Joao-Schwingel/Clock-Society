// CSV do estoque. Mesmas convenções do CSV de vendas (lib/calc/sales-csv.ts): BOM na frente para
// o Excel abrir em UTF-8, vírgula como separador, data em DD/MM/AAAA e número em pt-BR.
//
// Função pura, sem rede e sem banco: as linhas chegam já filtradas pela tela.

import { formatBR } from "@/lib/utils";

export type InventoryCsvRowInput = {
  product_name: string | null;
  location: string | null;
  quantity: number | null;
  unit_cost: number | null;
  total_value: number | null;
  last_updated: string | null;
  notes?: string | null;
};

// As mesmas colunas da tabela, mais Observações — que na tela só aparece no formulário.
export const INVENTORY_CSV_HEADERS = [
  "Produto",
  "Localização",
  "Quantidade",
  "Custo Unit.",
  "Valor Total",
  "Última Atualização",
  "Observações",
];

const formatMoney = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const escapeCSV = (val: unknown): string => {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function buildInventoryCsvRow(item: InventoryCsvRowInput): string[] {
  const quantity = Number(item.quantity ?? 0);
  const unitCost = Number(item.unit_cost ?? 0);
  // total_value é coluna do banco, mas pode vir nula; nesse caso recalcula.
  const totalValue = item.total_value === null || item.total_value === undefined
    ? quantity * unitCost
    : Number(item.total_value);

  return [
    item.product_name || "-",
    item.location || "-",
    String(quantity),
    formatMoney(unitCost),
    formatMoney(totalValue),
    item.last_updated ? formatBR(item.last_updated) : "-",
    item.notes || "-",
  ].map(escapeCSV);
}

/** Conteúdo completo do arquivo (BOM + cabeçalho + linhas). */
export function buildInventoryCsvContent(items: InventoryCsvRowInput[]): string {
  const rows = items.map(buildInventoryCsvRow);
  return "﻿" + [INVENTORY_CSV_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
