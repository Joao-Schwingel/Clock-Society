"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SaleCost, SaleWithDetails } from "@/lib/types";
import { SaleCostForm } from "./sale-cost-form";

interface SaleDetailsModalProps {
  sale: SaleWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function SaleDetailsModal({
  sale,
  isOpen,
  onClose,
  onChanged,
}: SaleDetailsModalProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saleData, setSaleData] = useState<SaleWithDetails>(sale);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setSaleData(sale);
  }, [sale]);

  const refreshSale = async () => {
    setIsRefreshing(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sales_with_details")
      .select(
        "id,company_id,user_id,salesperson_id,order_number,product_name,customer_name,sale_date,quantity,unit_price,total_price,entry_value,status,notes,created_at,salesperson,salesperson_info,costs,total_costs",
      )
      .eq("id", saleData.id)
      .single();

    if (!error && data) setSaleData(data as SaleWithDetails);
    setIsRefreshing(false);
  };

  const costs = useMemo<SaleCost[]>(
    () => (saleData.costs ?? []) as SaleCost[],
    [saleData.costs],
  );

  const totalCosts = Number(saleData.total_costs ?? 0);
  const netProfit = Number(saleData.total_price) - totalCosts;

  const entryValue = Number(saleData.entry_value ?? 0);
  const missingValue = Math.max(0, Number(saleData.total_price) - entryValue);

  const salespersonName =
    saleData.salesperson_info?.name ?? saleData.salesperson ?? "";

  const handleDeleteCost = async (costId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("sale_costs")
      .delete()
      .eq("id", costId);

    if (!error) {
      await refreshSale();
      onChanged();
    }
  };

  const handleFormSuccess = async () => {
    setIsFormOpen(false);
    await refreshSale();
    onChanged();
  };

  const money = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Venda</DialogTitle>
          <DialogDescription>
            Visualize informações completas e custos extras desta venda
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações da Venda</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  Número do Pedido
                </p>
                <p className="font-medium">{saleData.order_number || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Produto</p>
                <p className="font-medium">{saleData.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{saleData.customer_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-medium">{salespersonName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="font-medium">
                  {new Date(saleData.sale_date).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Quantidade</p>
                <p className="font-medium">{saleData.quantity}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Preço Unitário</p>
                <p className="font-medium">
                  R$ {money(Number(saleData.unit_price))}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="font-bold text-lg">
                  R$ {money(Number(saleData.total_price))}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Entrada</p>
                <p className="font-medium">R$ {money(entryValue)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Faltante</p>
                <p className="font-bold text-lg">R$ {money(missingValue)}</p>
              </div>

              {saleData.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="font-medium">{saleData.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Custos Extras</CardTitle>
                <Button size="sm" onClick={() => setIsFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Custo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isRefreshing ? (
                <p className="text-center text-muted-foreground py-4">
                  Atualizando...
                </p>
              ) : costs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum custo extra registrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">
                          {cost.cost_type}
                        </TableCell>
                        <TableCell>{cost.description || "-"}</TableCell>
                        <TableCell className="text-right">
                          R$ {money(Number(cost.amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCost(cost.id)}
                            aria-label="Excluir custo"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor da Venda:</span>
                <span className="font-medium">
                  R$ {money(Number(saleData.total_price))}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrada:</span>
                <span className="font-medium">R$ {money(entryValue)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Faltante:</span>
                <span className="font-medium">R$ {money(missingValue)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de Custos:</span>
                <span className="font-medium text-destructive">
                  - R$ {money(totalCosts)}
                </span>
              </div>

              <div className="flex justify-between pt-2 border-t">
                <span className="font-bold">Lucro Líquido:</span>
                <span
                  className={`font-bold text-lg ${
                    netProfit >= 0 ? "text-green-600" : "text-destructive"
                  }`}
                >
                  R$ {money(netProfit)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Button onClick={onClose} className="justify-self-end flex">
            Concluir
          </Button>
        </div>

        {isFormOpen && (
          <SaleCostForm
            saleId={saleData.id}
            onSuccess={handleFormSuccess}
            onCancel={() => setIsFormOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
