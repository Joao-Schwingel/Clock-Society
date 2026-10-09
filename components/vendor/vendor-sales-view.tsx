"use client";

import { useState } from "react";
import { DollarSign, Receipt, TrendingUp } from "lucide-react";
import { Spinner } from "@radix-ui/themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFilters } from "@/components/dashboard/dashboards-filters";
import { SalesTable } from "@/components/dashboard/sales-table";
import { SaleDetailsModal } from "@/components/dashboard/sale-details-modal";
import { TABLE_PAGE_SIZE, useSalesQuery } from "@/hooks/use-sales-query";
import { useCommissionSummary } from "@/hooks/use-commission-summary";
import { ownCommission, vendorSalesStats } from "@/lib/calc/vendor-sales";
import type { SaleWithDetails } from "@/lib/types";

// Colunas da vendor_sales (016): sem custo, margem ou líquido.
const VENDOR_STATS_SELECT = "id, status, total_price";
const VENDOR_TABLE_SELECT =
  "id, company_id, entry_value, payment_status, product_name, customer_name, sale_date, quantity, unit_price, total_price, status, order_number, notes, created_at, salespersons";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const noop = () => undefined;

// Aba Vendas do vendedor (planejamento 4.2–4.4; Fase 6, fatia 6.8). Mesmo motor do admin (6.1),
// lendo vendor_sales: só as vendas dele, sem custo, sem coluna líquida, sem exportar (Q4) e com o
// "olho" como única ação (3.9).
export function VendorSalesView({ companyId }: { companyId: string }) {
  const q = useSalesQuery({
    companyId,
    source: "vendor_sales",
    statsSelect: VENDOR_STATS_SELECT,
    tableSelect: VENDOR_TABLE_SELECT,
  });
  const { rows: commissionRows, isLoading: isLoadingCommission } = useCommissionSummary(companyId, q.months, q.year);
  const [viewingSale, setViewingSale] = useState<SaleWithDetails | null>(null);

  const stats = vendorSalesStats(q.sales);
  const commission = ownCommission(commissionRows);

  return (
    <div className="space-y-4">
      <div className="flex gap-6 items-center justify-between">
        <h3 className="text-lg font-semibold">Minhas vendas</h3>
        <DashboardFilters
          value={q.months}
          yearValue={q.year}
          onChange={q.handleMonthsChange}
          onYearChange={q.handleYearChange}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Concluídas</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <Spinner loading={q.isLoading} size="3">
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedCount}</div>
              <p className="text-xs text-muted-foreground">{stats.pendingCount} pendentes</p>
            </CardContent>
          </Spinner>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Vendido</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <Spinner loading={q.isLoading} size="3">
            <CardContent>
              <div className="text-2xl font-bold text-green-600">R$ {fmt(stats.completedTotal)}</div>
              <p className="text-xs text-muted-foreground">Vendas concluídas no período</p>
            </CardContent>
          </Spinner>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minha Comissão</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <Spinner loading={isLoadingCommission} size="3">
            <CardContent>
              <div className="text-2xl font-bold text-primary">R$ {fmt(commission)}</div>
              <p className="text-xs text-muted-foreground">Comissão do período</p>
            </CardContent>
          </Spinner>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendas</CardTitle>
          <CardDescription>As vendas em que você participa</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesTable
            mode="vendor"
            sales={q.tableSales}
            onEdit={noop}
            onDelete={noop}
            onViewDetails={setViewingSale}
            onStatusChange={noop}
            isLoading={q.isTableLoading}
            searchTerm={q.searchTerm}
            onSearchChange={q.handleSearchChange}
            onSearchConfirm={q.handleSearchConfirm}
            dateFilter={q.dateFilter}
            onDateFilterChange={q.handleDateFilterChange}
            onlyWithRemaining={q.onlyWithRemaining}
            onOnlyWithRemainingChange={q.handleOnlyWithRemainingChange}
            salespersonFilter={q.salespersonFilter}
            onSalespersonFilterChange={q.handleSalespersonFilterChange}
            salespersonsList={q.salespersonsList}
            statusFilter={q.statusFilter}
            onStatusFilterChange={q.handleStatusFilterChange}
            onExport={noop}
            isExporting={false}
            page={q.tablePage}
            totalPages={q.totalPages}
            totalCount={q.tableTotal}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={q.setTablePage}
          />
        </CardContent>
      </Card>

      {viewingSale && (
        <SaleDetailsModal
          sale={viewingSale}
          isOpen={!!viewingSale}
          onClose={() => setViewingSale(null)}
          onChanged={noop}
          readOnly
        />
      )}
    </div>
  );
}
