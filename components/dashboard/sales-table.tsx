"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Search,
  Eye,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Sale, Salesperson, SaleWithDetails } from "@/lib/types";
import { formatBR } from "@/lib/utils";

interface SalesTableProps {
  sales: SaleWithDetails[];
  onEdit: (sale: SaleWithDetails) => void;
  onDelete: (id: string) => void;
  onViewDetails: (sale: SaleWithDetails) => void;
  onStatusChange: () => void;
  isLoading: boolean;
  onPaymentConfirmed?: (saleId: string) => void;
}

type PaymentStatus = "pendente" | "pago";

export function SalesTable({
  sales,
  onEdit,
  onDelete,
  onViewDetails,
  onStatusChange,
  isLoading,
  onPaymentConfirmed,
}: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [onlyWithRemaining, setOnlyWithRemaining] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);

  const [salespersonsMap, setSalespersonsMap] = useState<
    Record<string, Salesperson>
  >({});

  useEffect(() => {
    void loadSalespersons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales]);

  const loadSalespersons = async () => {
    if (sales.length === 0) return;

    const supabase = createClient();
    const salespersonIds = [
      ...new Set(sales.map((s) => s.salesperson_id).filter(Boolean)),
    ];

    if (salespersonIds.length === 0) return;

    const { data } = await supabase
      .from("salespersons")
      .select("*")
      .in("id", salespersonIds);

    if (!data) return;

    const map: Record<string, Salesperson> = {};
    data.forEach((person) => {
      map[person.id] = person;
    });
    setSalespersonsMap(map);
  };

  const getSalespersonName = (salespersonId: string | null | undefined) => {
    if (!salespersonId) return "-";
    const person = salespersonsMap[salespersonId];
    return person ? person.name : "Desconhecido";
  };

  const formatMoneyBR = (value: number) =>
    value.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const totalSaleCost = (sale: SaleWithDetails): number =>
    Number(sale.costs.reduce((sum, c) => sum + Number(c.amount || 0), 0));

  const paymentStatusOf = (sale: SaleWithDetails): PaymentStatus =>
    ((sale as any).payment_status as PaymentStatus) ?? "pendente";

  const remainingOf = (sale: SaleWithDetails): number => {
    const total = Number(sale.total_price);
    const entry = Number((sale as any).entry_value ?? 0);
    if (paymentStatusOf(sale) === "pago") return 0;
    return Math.max(0, total - entry);
  };

  const isCashPaymentOf = (sale: SaleWithDetails): boolean => {
    const total = Number(sale.total_price);
    const entry = Number((sale as any).entry_value ?? 0);
    return entry === total;
  };

  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesSearch =
        !q ||
        sale.product_name.toLowerCase().includes(q) ||
        sale.customer_name?.toLowerCase().includes(q) ||
        sale.order_number?.toLowerCase().includes(q);

      const matchesDate = !dateFilter || sale.sale_date.startsWith(dateFilter);

      const matchesRemaining = !onlyWithRemaining || remainingOf(sale) > 0;

      return matchesSearch && matchesDate && matchesRemaining;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, searchTerm, dateFilter, onlyWithRemaining]);

  const handleStatusToggle = async (sale: Sale) => {
    if (sale.status === "concluída") return;

    setUpdatingStatus(sale.id);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("sales")
        .update({ status: "concluída" })
        .eq("id", sale.id);

      if (error) throw error;

      onStatusChange();
    } catch {
      alert("Erro ao atualizar status da venda");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleConfirmPayment = async (sale: SaleWithDetails) => {
    const isCash = isCashPaymentOf(sale);
    const remaining = remainingOf(sale);
    const paymentStatus = paymentStatusOf(sale);

    if (isCash || remaining <= 0 || paymentStatus === "pago") return;

    setUpdatingPayment(sale.id);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("sales")
        .update({ payment_status: "pago" })
        .eq("id", sale.id);

      if (error) throw error;

      onPaymentConfirmed?.(sale.id);
      onStatusChange();
    } catch {
      alert("Erro ao confirmar pagamento");
    } finally {
      setUpdatingPayment(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº do pedido, produto ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Input
          type="month"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-40"
        />

        <label className="flex items-center gap-2 select-none text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={onlyWithRemaining}
            onChange={(e) => setOnlyWithRemaining(e.target.checked)}
          />
          Somente com valor faltante
        </label>

        {(searchTerm || dateFilter || onlyWithRemaining) && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setDateFilter("");
              setOnlyWithRemaining(false);
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {filteredSales.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {sales.length === 0
            ? "Nenhuma venda registrada ainda."
            : "Nenhum resultado encontrado."}
        </div>
      ) : (
        <div className="rounded-md border relative">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nº Pedido</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Preço Liq.</TableHead>
                <TableHead>Custo Total</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Faltante</TableHead>
                <TableHead className="text-right sticky right-0 bg-background rounded-md">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredSales.map((sale) => {
                const cost = totalSaleCost(sale);
                const total = Number(sale.total_price);

                const entryRaw = Number((sale as any).entry_value ?? 0);
                const entryDisplay = entryRaw > 0 ? entryRaw : null;

                const paymentStatus = paymentStatusOf(sale);
                const remaining =
                  paymentStatus === "pago" ? 0 : Math.max(0, total - entryRaw);

                const showConfirmPayment =
                  entryRaw !== total &&
                  paymentStatus !== "pago" &&
                  remaining > 0;

                return (
                  <TableRow key={sale.id}>
                    <TableCell>{formatBR(sale.sale_date)}</TableCell>
                    <TableCell className="font-medium">
                      {sale.order_number || "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.product_name}
                    </TableCell>
                    <TableCell>{sale.customer_name || "-"}</TableCell>
                    <TableCell>
                      {getSalespersonName(sale.salesperson_id)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sale.status === "concluída" ? "default" : "secondary"
                        }
                      >
                        {sale.status === "concluída" ? "Concluída" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>{sale.quantity}</TableCell>
                    <TableCell>
                      R$ {formatMoneyBR(Number(sale.unit_price))}
                    </TableCell>
                    <TableCell>R$ {formatMoneyBR(cost)}</TableCell>
                    <TableCell>R$ {formatMoneyBR(total - cost)}</TableCell>
                    <TableCell>
                      {entryDisplay === null
                        ? "-"
                        : `R$ ${formatMoneyBR(entryDisplay)}`}
                    </TableCell>
                    <TableCell>R$ {formatMoneyBR(remaining)}</TableCell>
                    <TableCell className="text-right sticky right-0 bg-background rounded-md">
                      <div className="flex justify-end gap-2">
                        {showConfirmPayment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleConfirmPayment(sale)}
                            disabled={updatingPayment === sale.id}
                          >
                            <DollarSign className="h-4 w-4 text-green-600" />
                          </Button>
                        )}

                        {sale.status === "pendente" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusToggle(sale)}
                            disabled={updatingStatus === sale.id}
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewDetails(sale)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(sale)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (
                              confirm(
                                "Tem certeza que deseja excluir esta venda?",
                              )
                            ) {
                              onDelete(sale.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
