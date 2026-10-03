"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { SaleWithDetails } from "@/lib/types";
import { buildSaleDateRangeFilter } from "@/lib/calc/date-filters";
import { buildSalesCsvContent } from "@/lib/calc/sales-csv";
import {
  exportMonthRangesFilter,
  salespersonContainsFilter,
  searchOrFilter,
  tableMonthRange,
} from "@/lib/sales/sales-filters";

// Motor de vendas: filtros, paginação, estatísticas e exportação (planejamento 4.1; Fase 6, fatia
// 6.1). Extraído de components/dashboard/sales-view.tsx sem mudar a lógica. A origem é
// parametrizada: o admin lê `sales_with_details`; o vendedor (fatia 6.8) vai ler `vendor_sales`.

export type SalesSource = "sales_with_details" | "vendor_sales";

export const TABLE_PAGE_SIZE = 10;

// Campos mínimos para os cards de estatísticas
export const STATS_SELECT =
  "id, status, total_price, total_costs, quantity, payment_status, entry_value";

// Todos os campos necessários para renderizar a tabela
export const TABLE_SELECT =
  "id, company_id, user_id, entry_value, payment_status, product_name, customer_name, sale_date, quantity, unit_price, total_price, status, order_number, notes, created_at, salespersons, costs, total_costs";

interface UseSalesQueryOptions {
  companyId: string;
  source?: SalesSource;
  statsSelect?: string;
  tableSelect?: string;
}

export function useSalesQuery({
  companyId,
  source = "sales_with_details",
  statsSelect = STATS_SELECT,
  tableSelect = TABLE_SELECT,
}: UseSalesQueryOptions) {
  // ── Estado dos cards de estatísticas ──────────────────────────
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [months, setMonths] = useState<number[]>([]);
  const [year, setYear] = useState("2026");

  // ── Estado da tabela paginada ──────────────────────────────────
  const [tableSales, setTableSales] = useState<SaleWithDetails[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tablePage, setTablePage] = useState(0);
  const [isTableLoading, setIsTableLoading] = useState(true);

  // ── Filtros da tabela ──────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [onlyWithRemaining, setOnlyWithRemaining] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── Lista de vendedores para o filtro ──────────────────────────
  const [salespersonsList, setSalespersonsList] = useState<{ id: string; name: string }[]>([]);

  // ── Estado de exportação ─────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  // ── Query de estatísticas (sem paginação) ──────────────────────
  const fetchSales = async () => {
    setIsLoading(true);
    const supabase = createClient();
    let query = supabase.from(source).select(statsSelect).eq("company_id", companyId);

    const dateOr = buildSaleDateRangeFilter(months, year);
    if (dateOr) query = query.or(dateOr);

    const { data, error } = await query;
    if (!error && data) setSales(data as unknown as SaleWithDetails[]);
    setIsLoading(false);
  };

  // ── Carregar vendedores para o filtro ──────────────────────────
  const fetchSalespersons = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("salespersons")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    if (data) setSalespersonsList(data);
  };

  // Filtros da tabela (busca, mês da tabela, faltante, status, vendedor), comuns à tabela e à
  // exportação. O filtro de meses do topo NÃO entra aqui: tabela e exportação o montam diferente.
  const applyTableFilters = <Q extends { or: any; gte: any; eq: any; filter: any }>(query: Q): Q => {
    let q = query;
    const search = searchOrFilter(appliedSearch);
    if (search) q = q.or(search);

    const range = tableMonthRange(dateFilter);
    if (range) q = q.gte("sale_date", range.gte).lt("sale_date", range.lt);

    if (onlyWithRemaining) q = q.eq("payment_status", "pendente");
    if (statusFilter) q = q.eq("status", statusFilter);
    if (salespersonFilter) q = q.filter(...salespersonContainsFilter(salespersonFilter));
    return q;
  };

  // ── Query da tabela (com paginação + filtros server-side) ──────
  const fetchTableData = async () => {
    setIsTableLoading(true);
    const supabase = createClient();

    let query = supabase.from(source).select(tableSelect, { count: "exact" }).eq("company_id", companyId);

    // Filtro de meses do dashboard (mesmo que os cards)
    const dateOr = buildSaleDateRangeFilter(months, year);
    if (dateOr) query = query.or(dateOr);

    query = applyTableFilters(query);

    // Paginação
    const from = tablePage * TABLE_PAGE_SIZE;
    const to = from + TABLE_PAGE_SIZE - 1;

    const { data, count, error } = await query.order("order_number", { ascending: false }).range(from, to);

    if (!error && data) {
      setTableSales(data as unknown as SaleWithDetails[]);
      setTableTotal(count ?? 0);
    }
    setIsTableLoading(false);
  };

  // Stats: dispara quando mudam mês/ano
  useEffect(() => {
    void fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, months, year]);

  // Vendedores: carrega uma vez
  useEffect(() => {
    void fetchSalespersons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Tabela: dispara quando mudam filtros ou página
  useEffect(() => {
    void fetchTableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    companyId,
    months,
    year,
    appliedSearch,
    dateFilter,
    onlyWithRemaining,
    salespersonFilter,
    statusFilter,
    tablePage,
  ]);

  const refreshAll = () => {
    void fetchSales();
    void fetchTableData();
  };

  // Atualização otimista depois de confirmar um pagamento (tabela e cartões).
  const markPaymentConfirmed = (saleId: string) => {
    const patch = (prev: SaleWithDetails[]) =>
      prev.map((s) => (s.id === saleId ? ({ ...s, payment_status: "pago" } as SaleWithDetails) : s));
    setTableSales(patch);
    setSales(patch);
  };

  // ── Handlers de filtros da tabela (sempre resetam pra página 0) ─
  const handleSearchChange = (v: string) => {
    setSearchTerm(v);
    if (v === "") {
      setAppliedSearch("");
      setTablePage(0);
    }
  };

  const handleSearchConfirm = () => {
    setAppliedSearch(searchTerm);
    setTablePage(0);
  };

  const handleDateFilterChange = (v: string) => {
    setDateFilter(v);
    setTablePage(0);
  };

  const handleOnlyWithRemainingChange = (v: boolean) => {
    setOnlyWithRemaining(v);
    setTablePage(0);
  };

  const handleSalespersonFilterChange = (v: string) => {
    setSalespersonFilter(v);
    setTablePage(0);
  };

  const handleStatusFilterChange = (v: string) => {
    setStatusFilter(v);
    setTablePage(0);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setAppliedSearch("");
    setDateFilter("");
    setOnlyWithRemaining(false);
    setSalespersonFilter("");
    setStatusFilter("");
    setTablePage(0);
  };

  const handleMonthsChange = (m: number[]) => {
    setMonths(m);
    setTablePage(0);
  };

  const handleYearChange = (y: string) => {
    setYear(y);
    setTablePage(0);
  };

  // ── Exportação CSV (mesmos filtros, sem paginação) ────────────
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const supabase = createClient();

      let query = supabase.from(source).select(tableSelect).eq("company_id", companyId);

      const monthsOr = exportMonthRangesFilter(months, year);
      if (monthsOr) query = query.or(monthsOr);

      query = applyTableFilters(query);

      const { data, error } = await query.order("order_number", { ascending: false });

      if (error || !data || data.length === 0) {
        toast.error("Nenhum dado para exportar", { position: "top-center" });
        return;
      }

      // Buscar nomes dos produtos via sale_items (em lotes para evitar URL longa)
      const rows = data as unknown as Array<{ id: string }>;
      const allSaleIds = rows.map((s) => s.id);
      const productMap: Record<string, string> = {};
      const qtyMap: Record<string, number> = {};

      const BATCH_SIZE = 200;
      for (let i = 0; i < allSaleIds.length; i += BATCH_SIZE) {
        const batch = allSaleIds.slice(i, i + BATCH_SIZE);
        const { data: itemsData } = await supabase
          .from("sale_items")
          .select("sale_id,product_name,quantity")
          .in("sale_id", batch);

        if (itemsData) {
          for (const row of itemsData as Array<{ sale_id: string; product_name: string; quantity: number }>) {
            qtyMap[row.sale_id] = (qtyMap[row.sale_id] ?? 0) + Number(row.quantity || 0);
            const name = (row.product_name ?? "").trim();
            if (!name) continue;
            if (!productMap[row.sale_id]) {
              productMap[row.sale_id] = name;
            } else if (!productMap[row.sale_id].includes(name)) {
              productMap[row.sale_id] += `, ${name}`;
            }
          }
        }
      }

      const csvContent = buildSalesCsvContent(data as any, qtyMap, productMap);

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vendas-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`${rows.length} vendas exportadas`, { position: "top-center" });
    } catch (error) {
      console.log(error);
      toast.error("Erro ao exportar vendas", { position: "top-center" });
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    !!searchTerm || !!appliedSearch || !!dateFilter || onlyWithRemaining || !!salespersonFilter || !!statusFilter;

  return {
    // estatísticas
    sales,
    isLoading,
    months,
    year,
    handleMonthsChange,
    handleYearChange,
    // tabela
    tableSales,
    tableTotal,
    tablePage,
    setTablePage,
    isTableLoading,
    totalPages: Math.ceil(tableTotal / TABLE_PAGE_SIZE),
    // filtros
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
    // ações
    refreshAll,
    markPaymentConfirmed,
    handleExport,
    isExporting,
  };
}
