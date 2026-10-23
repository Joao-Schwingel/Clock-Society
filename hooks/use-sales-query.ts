"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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

  // Cada clique de mês (ou de página) dispara uma busca nova; só a resposta da requisição mais
  // recente pode atualizar a tela, senão uma resposta antiga sobrescreve a nova.
  const statsRequestId = useRef(0);
  const tableRequestId = useRef(0);

  // ── Query de estatísticas (todas as linhas, paginadas) ─────────
  // Paginada porque o PostgREST corta qualquer resposta em 1000 linhas, sem erro nem aviso: sem
  // isso os cards passam a mentir quando a empresa cruza esse volume (PR #15).
  const fetchSales = async () => {
    const currentRequest = ++statsRequestId.current;
    const isStale = () => currentRequest !== statsRequestId.current;

    setIsLoading(true);
    const supabase = createClient();
    const dateOr = buildSaleDateRangeFilter(months, year);

    try {
      const data = await fetchAllRows<SaleWithDetails>((from, to) => {
        let query = supabase.from(source).select(statsSelect).eq("company_id", companyId);
        if (dateOr) query = query.or(dateOr);
        // `select()` com string montada em runtime faz o TS inferir GenericStringError[]; o shape
        // real é o da view. Mesmo motivo do cast que já existe em setTableSales.
        return query.order("id").range(from, to) as unknown as Promise<{
          data: SaleWithDetails[] | null;
          error: PostgrestError | null;
        }>;
      });

      // Uma seleção de meses mais nova já disparou outro fetchSales: descarta este.
      if (isStale()) return;
      setSales(data);
    } catch (err) {
      console.error("Erro ao carregar as estatísticas de vendas:", err);
      // Sem isso a tela continuaria mostrando os números do filtro anterior como se fossem atuais.
      if (!isStale()) toast.error("Erro ao carregar as vendas. Tente novamente.", { position: "top-center" });
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  // ── Carregar vendedores para o filtro ──────────────────────────
  const fetchSalespersons = async () => {
    const supabase = createClient();
    // 022: quem atende a empresa vem dos acessos, não mais de salespersons.company_id.
    // Duas consultas simples em vez de embed: o mock server dos E2E não emula `!inner`.
    const { data: acessos } = await supabase
      .from("salesperson_companies")
      .select("salesperson_id")
      .eq("company_id", companyId)
      .eq("is_active", true);
    const ids = (acessos ?? []).map((a) => a.salesperson_id as string);
    if (ids.length === 0) {
      setSalespersonsList([]);
      return;
    }
    const { data } = await supabase
      .from("salespersons")
      .select("id, name")
      .in("id", ids)
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

    const currentRequest = ++tableRequestId.current;
    const isStale = () => currentRequest !== tableRequestId.current;

    const { data, count, error } = await query.order("order_number", { ascending: false }).range(from, to);

    // Uma página ou filtro mais novo já disparou outra busca: descarta esta resposta.
    if (isStale()) return;

    if (error) {
      console.error("Erro ao carregar a tabela de vendas:", error);
      toast.error("Erro ao carregar a tabela de vendas. Tente novamente.", { position: "top-center" });
    } else if (data) {
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
