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

type PaymentStatus = "pendente" | "pago";

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  created_at: string;
};

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

  const [items, setItems] = useState<SaleItemRow[]>([]);

  useEffect(() => {
    setSaleData(sale);
  }, [sale]);

  useEffect(() => {
    void loadSaleItems(sale.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id]);

  const loadSaleItems = async (saleId: string) => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sale_items")
      .select("id,sale_id,product_name,quantity,created_at")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true });

    if (error) {
      // fallback legacy
      setItems([
        {
          id: "legacy",
          sale_id: saleId,
          product_name: (saleData as any).product_name ?? "",
          quantity: Number((saleData as any).quantity ?? 0),
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    setItems((data as SaleItemRow[]) ?? []);
  };

  const refreshSale = async () => {
    setIsRefreshing(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sales_with_details")
      .select(
        `
        id,
        company_id,
        user_id,
        entry_value,
        payment_status,
        product_name,
        customer_name,
        sale_date,
        quantity,
        unit_price,
        total_price,
        status,
        order_number,
        notes,
        created_at,
        salespersons,
        costs,
        total_costs
        `,
      )
      .eq("id", saleData.id)
      .single();

    if (!error && data) setSaleData(data as SaleWithDetails);

    await loadSaleItems(saleData.id);
    setIsRefreshing(false);
  };

  console.log(saleData)
  const costs = useMemo<SaleCost[]>(
    () => (saleData.costs ?? []) as SaleCost[],
    [saleData.costs],
  );

  const totalCosts = Number((saleData as any).total_costs ?? 0);
  const saleTotal = Number(saleData.total_price);
  const netProfit = saleTotal - totalCosts;

  const entryValue = Number((saleData as any).entry_value ?? 0);

  const paymentStatus: PaymentStatus =
    ((saleData as any).payment_status as PaymentStatus) ?? "pendente";

  const saleStatus = saleData.status;

  const missingValue =
    paymentStatus === "pago" ? 0 : Math.max(0, saleTotal - entryValue);

  const totalQty = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
    [items],
  );

  const money = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Venda</DialogTitle>
          <DialogDescription>
            Visualize informações completas e custos desta venda
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
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{saleData.customer_name || "-"}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-medium">{saleData.salespersons.map((person) => person.name).join(",") || "-"}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="font-medium">
                  {new Date(saleData.sale_date).toLocaleDateString("pt-BR")}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">
                  Quantidade de Itens
                </p>
                <p className="font-medium">{totalQty}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="font-bold text-lg">R$ {money(saleTotal)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Entrada</p>
                <p className="font-medium">R$ {money(entryValue)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Valor Faltante</p>
                <p className="font-bold text-lg">R$ {money(missingValue)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status da Venda</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    saleStatus === "concluída"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {saleStatus === "concluída" ? "Concluída" : "Pendente"}
                </span>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">
                  Status do Pagamento
                </p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    paymentStatus === "pago"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {paymentStatus === "pago" ? "Pago" : "Pendente"}
                </span>
              </div>

              {saleData.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="font-medium">{saleData.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* NEW: lista de produtos (sem preços) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Produtos</CardTitle>
            </CardHeader>
            <CardContent>
              {isRefreshing ? (
                <p className="text-center text-muted-foreground py-4">
                  Atualizando...
                </p>
              ) : items.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum produto registrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium max-w-[500px] truncate">
                          {it.product_name}
                        </TableCell>
                        <TableCell className="text-center">{it.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Custos</CardTitle>
                <Button size="sm" onClick={() => setIsFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Custo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto w-full">
              {isRefreshing ? (
                <p className="text-center text-muted-foreground py-4">
                  Atualizando...
                </p>
              ) : costs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum custo extra registrado
                </p>
              ) : (
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[10%]">Tipo</TableHead>
                      <TableHead className="w-[60%]">Descrição</TableHead>
                      <TableHead className="w-[15%]">Valor</TableHead>
                      <TableHead className="w-[15%]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">
                          {cost.cost_type}
                        </TableCell>
                        <TableCell className="truncate" title={cost.description ?? "Sem Descrição"}>{cost.description || "-"}</TableCell>
                        <TableCell>R$ {money(Number(cost.amount))}</TableCell>
                        <TableCell>
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
                <span className="font-medium">R$ {money(saleTotal)}</span>
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
