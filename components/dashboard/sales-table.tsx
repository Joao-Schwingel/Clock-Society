"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Search,
  Eye,
  CheckCircle,
  CircleX,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { Sale, SaleWithDetails } from "@/lib/types";
import { formatBR } from "@/lib/utils";

interface SalesTableProps {
  sales: SaleWithDetails[];
  onEdit: (sale: SaleWithDetails) => void;
  onDelete: (id: string) => void;
  onViewDetails: (sale: SaleWithDetails) => void;
  onStatusChange: () => void;
  isLoading: boolean;
  onPaymentConfirmed?: (saleId: string) => void;
  // Filtros controlados pelo pai
  searchTerm: string;
  onSearchChange: (v: string) => void;
  onSearchConfirm: () => void;
  dateFilter: string;
  onDateFilterChange: (v: string) => void;
  onlyWithRemaining: boolean;
  onOnlyWithRemainingChange: (v: boolean) => void;
  salespersonFilter: string;
  onSalespersonFilterChange: (v: string) => void;
  salespersonsList: { id: string; name: string }[];
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  onExport: () => void;
  isExporting: boolean;
  // Paginação
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
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
  searchTerm,
  onSearchChange,
  onSearchConfirm,
  dateFilter,
  onDateFilterChange,
  onlyWithRemaining,
  onOnlyWithRemainingChange,
  salespersonFilter,
  onSalespersonFilterChange,
  salespersonsList,
  statusFilter,
  onStatusFilterChange,
  onExport,
  isExporting,
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: SalesTableProps) {
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);

  const [qtySumBySaleId, setQtySumBySaleId] = useState<Record<string, number>>(
    {},
  );
  const [productNamesBySaleId, setProductNamesBySaleId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    void loadSaleItemsAgg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales]);

  const loadSaleItemsAgg = async () => {
    if (sales.length === 0) {
      setQtySumBySaleId({});
      setProductNamesBySaleId({});
      return;
    }

    const supabase = createClient();
    const saleIds = sales.map((s) => s.id);

    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id,product_name,quantity")
      .in("sale_id", saleIds);

    if (error || !data) {
      setQtySumBySaleId({});
      setProductNamesBySaleId({});
      return;
    }

    const qtyMap: Record<string, number> = {};
    const namesMap: Record<string, Set<string>> = {};

    for (const row of data as Array<{
      sale_id: string;
      product_name: string;
      quantity: number;
    }>) {
      qtyMap[row.sale_id] =
        (qtyMap[row.sale_id] ?? 0) + Number(row.quantity || 0);

      const name = (row.product_name ?? "").trim();
      if (!name) continue;
      (namesMap[row.sale_id] ??= new Set()).add(name);
    }

    const productStrMap: Record<string, string> = {};
    for (const [saleId, set] of Object.entries(namesMap)) {
      productStrMap[saleId] = Array.from(set).join(", ");
    }

    setQtySumBySaleId(qtyMap);
    setProductNamesBySaleId(productStrMap);
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

  const handleStatusToggle = async (sale: Sale) => {
    const nextStatus = sale.status == "concluída" ? "pendente" : "concluída";

    setUpdatingStatus(sale.id);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("sales")
        .update({ status: nextStatus })
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

  const hasFilters =
    searchTerm || dateFilter || onlyWithRemaining || salespersonFilter || statusFilter;

  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalCount);

  const skeletonRows = 5;

  return (
    <div className="space-y-4">
      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº do pedido, produto ou cliente\u2026"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchConfirm();
              }}
              className="pl-9"
            />
          </div>
          <Button onClick={onSearchConfirm}>
            Buscar
          </Button>
        </div>

        <Input
          type="month"
          value={dateFilter}
          onChange={(e) => onDateFilterChange(e.target.value)}
          className="w-40"
        />

        <Select
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="concluída">Concluída</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={salespersonFilter}
          onValueChange={(v) => onSalespersonFilterChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {salespersonsList.map((sp) => (
              <SelectItem key={sp.id} value={sp.id}>
                {sp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 select-none text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={onlyWithRemaining}
            onChange={(e) => onOnlyWithRemainingChange(e.target.checked)}
          />
          Somente com valor faltante
        </label>

        <Button variant="outline" onClick={onExport} disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? "Exportando\u2026" : "Exportar"}
        </Button>
      </div>

      {/* ── Tabela ───────────────────────────────────────────── */}
      {!isLoading && sales.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {totalCount === 0 && !hasFilters
            ? "Nenhuma venda registrada ainda."
            : "Nenhum resultado encontrado."}
        </div>
      ) : (
        <div className="rounded-md border relative overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nº Pedido</TableHead>
                <TableHead>Produtos</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Custo Total</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Faltante</TableHead>
                <TableHead className="text-right sticky right-0 bg-background rounded-md">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading
                ? Array.from({ length: skeletonRows }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="text-right sticky right-0 bg-background">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <Skeleton className="h-8 w-8 rounded-md" />
                          <Skeleton className="h-8 w-8 rounded-md" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                : sales.map((sale) => {
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

                const qtySum = qtySumBySaleId[sale.id] ?? sale.quantity ?? 0;

                const productsLabel =
                  productNamesBySaleId[sale.id] || sale.product_name || "-";

                return (
                  <TableRow key={sale.id}>
                    <TableCell>{formatBR(sale.sale_date)}</TableCell>
                    <TableCell className="font-medium">
                      {sale.order_number || "-"}
                    </TableCell>
                    <TableCell
                      className="font-medium max-w-[280px] truncate"
                      title={productsLabel}
                    >
                      {productsLabel}
                    </TableCell>
                    <TableCell>{sale.customer_name || "-"}</TableCell>
                    <TableCell>
                      {sale.salespersons.map((person) => person.name).join(",")}
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
                    <TableCell>{qtySum}</TableCell>
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

                        {sale.status === "pendente" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusToggle(sale)}
                            disabled={updatingStatus === sale.id}
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusToggle(sale)}
                            disabled={updatingStatus === sale.id}
                          >
                            <CircleX className="h-4 w-4 text-red-600" />
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

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>

                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Essa ação não poderá ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(sale.id)}
                              >
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* ── Paginação ──────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {rangeStart}–{rangeEnd} de {totalCount} vendas
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-sm tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
