"use client";

import { Skeleton } from "@radix-ui/themes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommissionRow } from "@/lib/calc/commissions";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

// Comissões por vendedor — componente compartilhado entre o Dashboard do admin e a área do
// vendedor (planejamento 4.5; Fase 6, fatia 6.4). Mostra exatamente as linhas que a RPC devolveu:
// o admin recebe também o inativo (etiqueta INATIVO); o vendedor recebe os colegas sem a comissão.
export function CommissionsBySalesperson({ rows, isLoading }: { rows: CommissionRow[]; isLoading: boolean }) {
  return (
    <div>
      <h4 className="text-lg font-semibold mb-3">Comissões por Vendedor</h4>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 && !isLoading && (
          <p className="text-muted-foreground col-span-2">Nenhum vendedor ativo cadastrado.</p>
        )}
        {rows.map((row) => (
          <Skeleton key={row.salesperson_id} loading={isLoading}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{row.salesperson_name}</CardTitle>
                  {!row.is_active && <Badge variant="secondary">INATIVO</Badge>}
                </div>
                <CardDescription>
                  {row.sales_count} venda{row.sales_count !== 1 ? "s" : ""} concluída{row.sales_count !== 1 ? "s" : ""}
                  {row.sales_count === 0 && " • Sem comissão no período"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total de Vendas:</span>
                  <span className="font-medium">R$ {fmt(row.total_sales)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Custos das Vendas:</span>
                  <span className="font-medium text-orange-600">− R$ {fmt(row.total_costs)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Lucro Líquido:</span>
                  <span className="font-medium text-primary">R$ {fmt(row.net_profit)}</span>
                </div>
                {row.total_commission !== null && (
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Comissão Total:</span>
                    <span className="font-medium text-green-600">R$ {fmt(row.total_commission)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Skeleton>
        ))}
      </div>
    </div>
  );
}
