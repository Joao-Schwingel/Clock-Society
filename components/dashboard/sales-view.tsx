"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  DollarSign,
  TrendingUp,
  Receipt,
  TrendingDown,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SaleWithDetails } from "@/lib/types";
import { SalesForm } from "./sales-form";
import { SalesTable } from "./sales-table";
import { SaleDetailsModal } from "./sale-details-modal";
import { Spinner } from "@radix-ui/themes";
import { DashboardFilters } from "./dashboards-filters";
import { toast } from "sonner";
import { summarizeSalesStats } from "@/lib/calc/sales-stats";
import { TABLE_PAGE_SIZE, useSalesQuery } from "@/hooks/use-sales-query";

interface SalesViewProps {
  companyId: string;
}

export function SalesView({ companyId }: SalesViewProps) {
  // Motor de vendas (filtros, paginação, estatísticas, exportação): hooks/use-sales-query.ts.
  const {
    sales,
    isLoading,
    months,
    year,
    handleMonthsChange,
    handleYearChange,
    tableSales,
    tableTotal,
    tablePage,
    setTablePage,
    isTableLoading,
    totalPages,
    searchTerm,
    dateFilter,
    onlyWithRemaining,
    salespersonFilter,
    statusFilter,
    salespersonsList,
    hasActiveFilters,
    handleSearchChange,
    handleSearchConfirm,
    handleDateFilterChange,
    handleOnlyWithRemainingChange,
    handleSalespersonFilterChange,
    handleStatusFilterChange,
    handleClearFilters,
    refreshAll,
    markPaymentConfirmed,
    handleExport,
    isExporting,
  } = useSalesQuery({ companyId });

  // ── Estado de modais / formulários ────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null);
  const [viewingSale, setViewingSale] = useState<SaleWithDetails | null>(null);

  // ── Handlers de ações ─────────────────────────────────────────
  const handleAdd = () => {
    setEditingSale(null);
    setIsFormOpen(true);
  };

  const handleEdit = (sale: SaleWithDetails) => {
    setEditingSale(sale);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (!error) refreshAll();
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingSale(null);
    toast.success("Venda cadastrada com sucesso", { position: "top-center" });
    refreshAll();
  };

  const handleViewDetails = (sale: SaleWithDetails) => {
    setViewingSale(sale);
  };

  const handleStatusChange = () => {
    refreshAll();
  };

  // ── Cálculos dos cards de estatísticas ────────────────────────
  const {
    completedCount,
    pendingCount,
    completedRevenue,
    pendingRevenue,
    completedCosts,
    pendingCosts,
    completedNetProfit,
    pendingNetProfit,
    completedItemsCount,
    pendingItemsCount,
    paymentsCompletedCount,
    paymentsPendingCount,
    totalMissingPayments,
  } = summarizeSalesStats(sales);

  return (
    <div className="space-y-4">
      {/* ── Vendas Concluídas ─────────────────────────────────── */}
      <div>
        <div className="flex gap-6 items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-green-600">
            Vendas Concluídas
          </h3>
          <DashboardFilters
            value={months}
            yearValue={year}
            onChange={handleMonthsChange}
            onYearChange={handleYearChange}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Concluída
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  R${" "}
                  {completedRevenue.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedCount} vendas aprovadas
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos Concluídos
              </CardTitle>
              <Receipt className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  R${" "}
                  {completedCosts.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Custos de vendas aprovadas
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Lucro Líquido Concluído
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    completedNetProfit >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  R${" "}
                  {completedNetProfit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Receita - Custos
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Items Vendidos
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold">
                  {completedItemsCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantidade total
                </p>
              </CardContent>
            </Spinner>
          </Card>
        </div>
      </div>

      {/* ── Vendas Pendentes ──────────────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-yellow-600">
          Vendas Pendentes
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Pendente
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  R${" "}
                  {pendingRevenue.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {pendingCount} vendas aguardando
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos Pendentes
              </CardTitle>
              <Receipt className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  R${" "}
                  {pendingCosts.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Custos de vendas pendentes
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Lucro Líquido Pendente
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    pendingNetProfit >= 0 ? "text-yellow-600" : "text-red-600"
                  }`}
                >
                  R${" "}
                  {pendingNetProfit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Receita - Custos
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Items Pendentes
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold">
                  {pendingItemsCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantidade aguardando
                </p>
              </CardContent>
            </Spinner>
          </Card>
        </div>
      </div>

      {/* ── Pagamentos ───────────────────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-blue-600">
          Pagamentos
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pagamentos Concluídos
              </CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {paymentsCompletedCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendas com pagamento confirmado
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pagamentos Pendentes
              </CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {paymentsPendingCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendas aguardando pagamento
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Valor Total Faltante
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  R${" "}
                  {totalMissingPayments.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total a receber (total - entrada)
                </p>
              </CardContent>
            </Spinner>
          </Card>
        </div>
      </div>

      {/* ── Tabela de vendas ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vendas</CardTitle>
              <CardDescription>
                Gerencie as vendas desta empresa
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
              >
                Limpar filtros
              </Button>
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Venda
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SalesTable
            sales={tableSales}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewDetails={handleViewDetails}
            onStatusChange={handleStatusChange}
            isLoading={isTableLoading}
            onPaymentConfirmed={markPaymentConfirmed}
            // Filtros controlados pelo pai
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            onSearchConfirm={handleSearchConfirm}
            dateFilter={dateFilter}
            onDateFilterChange={handleDateFilterChange}
            onlyWithRemaining={onlyWithRemaining}
            onOnlyWithRemainingChange={handleOnlyWithRemainingChange}
            salespersonFilter={salespersonFilter}
            onSalespersonFilterChange={handleSalespersonFilterChange}
            salespersonsList={salespersonsList}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            onExport={handleExport}
            isExporting={isExporting}
            // Paginação
            page={tablePage}
            totalPages={totalPages}
            totalCount={tableTotal}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setTablePage}
          />
        </CardContent>
      </Card>

      {isFormOpen && (
        <SalesForm
          companyId={companyId}
          sale={editingSale}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      )}

      {viewingSale && (
        <SaleDetailsModal
          sale={viewingSale}
          isOpen={!!viewingSale}
          onClose={() => setViewingSale(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}
