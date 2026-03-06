"use client";

import { useEffect, useState } from "react";
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
import { formatBR } from "@/lib/utils";

interface SalesViewProps {
  companyId: string;
  userId: string;
}

const TABLE_PAGE_SIZE = 10;

// Campos mínimos para os cards de estatísticas
const STATS_SELECT =
  "id, status, total_price, total_costs, quantity, payment_status, entry_value";

// Todos os campos necessários para renderizar a tabela
const TABLE_SELECT =
  "id, company_id, user_id, entry_value, payment_status, product_name, customer_name, sale_date, quantity, unit_price, total_price, status, order_number, notes, created_at, salespersons, costs, total_costs";

export function SalesView({ companyId, userId }: SalesViewProps) {
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

  // ── Filtros da tabela (lifted do SalesTable) ───────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [onlyWithRemaining, setOnlyWithRemaining] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── Lista de vendedores para o filtro ──────────────────────────
  const [salespersonsList, setSalespersonsList] = useState<
    { id: string; name: string }[]
  >([]);

  // ── Estado de exportação ─────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  // ── Estado de modais / formulários ────────────────────────────
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null);
  const [viewingSale, setViewingSale] = useState<SaleWithDetails | null>(null);

  // ── Query de estatísticas (sem paginação) ──────────────────────
  const fetchSales = async () => {
    setIsLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("sales_with_details")
      .select(STATS_SELECT)
      .eq("company_id", companyId);

    if (months.length > 0) {
      const ranges = months.map((m) => {
        const start = new Date(Number(year), m, 1);
        const end = new Date(Number(year), m + 1, 1);
        return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
      });
      query = query.or(ranges.join(","));
    }

    const { data, error } = await query;
    if (!error && data) setSales(data as SaleWithDetails[]);
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

  // ── Buscar sale_ids de um vendedor específico ──────────────────
  const getSaleIdsBySalesperson = async (
    salespersonId: string,
  ): Promise<string[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("sale_salespersons")
      .select("sale_id")
      .eq("salesperson_id", salespersonId);
    return data?.map((r: any) => r.sale_id) ?? [];
  };

  // ── Query da tabela (com paginação + filtros server-side) ──────
  const fetchTableData = async () => {
    setIsTableLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("sales_with_details")
      .select(TABLE_SELECT, { count: "exact" })
      .eq("company_id", companyId);

    // Filtro de meses do dashboard (mesmo que os cards)
    if (months.length > 0) {
      const ranges = months.map((m) => {
        const start = new Date(Number(year), m, 1);
        const end = new Date(Number(year), m + 1, 1);
        return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
      });
      query = query.or(ranges.join(","));
    }

    // Filtro de busca (produto, cliente, nº pedido)
    if (appliedSearch.trim()) {
      const q = appliedSearch.trim();
      query = query.or(
        `customer_name.ilike.%${q}%,order_number.ilike.%${q}%,product_name.ilike.%${q}%`,
      );
    }

    // Filtro de mês específico da tabela
    if (dateFilter) {
      const [filterYear, filterMonth] = dateFilter.split("-").map(Number);
      const startStr = `${dateFilter}-01`;
      // filterMonth é 1-based; new Date(y, m, 1) usa 0-based → filterMonth já aponta pro mês seguinte
      const endStr = new Date(filterYear, filterMonth, 1)
        .toISOString()
        .split("T")[0];
      query = query.gte("sale_date", startStr).lt("sale_date", endStr);
    }

    // Filtro de pagamento pendente
    if (onlyWithRemaining) {
      query = query.eq("payment_status", "pendente");
    }

    // Filtro de status da venda
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    // Filtro de vendedor
    if (salespersonFilter) {
      const saleIds = await getSaleIdsBySalesperson(salespersonFilter);
      if (saleIds.length === 0) {
        setTableSales([]);
        setTableTotal(0);
        setIsTableLoading(false);
        return;
      }
      query = query.in("id", saleIds);
    }

    // Paginação
    const from = tablePage * TABLE_PAGE_SIZE;
    const to = from + TABLE_PAGE_SIZE - 1;

    const { data, count, error } = await query
      .order("order_number", { ascending: false })
      .range(from, to);

    if (!error && data) {
      setTableSales(data as SaleWithDetails[]);
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

      let query = supabase
        .from("sales_with_details")
        .select(TABLE_SELECT)
        .eq("company_id", companyId);

      if (months.length > 0) {
        const ranges = months.map((m) => {
          const start = new Date(Number(year), m, 1);
          const end = new Date(Number(year), m + 1, 1);
          return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
        });
        query = query.or(ranges.join(","));
      }

      if (appliedSearch.trim()) {
        const q = appliedSearch.trim();
        query = query.or(
          `customer_name.ilike.%${q}%,order_number.ilike.%${q}%,product_name.ilike.%${q}%`,
        );
      }

      if (dateFilter) {
        const [filterYear, filterMonth] = dateFilter.split("-").map(Number);
        const startStr = `${dateFilter}-01`;
        const endStr = new Date(filterYear, filterMonth, 1)
          .toISOString()
          .split("T")[0];
        query = query.gte("sale_date", startStr).lt("sale_date", endStr);
      }

      if (onlyWithRemaining) {
        query = query.eq("payment_status", "pendente");
      }

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      if (salespersonFilter) {
        const saleIds = await getSaleIdsBySalesperson(salespersonFilter);
        if (saleIds.length === 0) {
          toast.error("Nenhum dado para exportar", { position: "top-center" });
          return;
        }
        query = query.in("id", saleIds);
      }

      const { data, error } = await query.order("order_number", {
        ascending: false,
      });

      if (error || !data || data.length === 0) {
        toast.error("Nenhum dado para exportar", { position: "top-center" });
        return;
      }

      // Buscar nomes dos produtos via sale_items (em lotes para evitar URL longa)
      const allSaleIds = data.map((s: any) => s.id) as string[];
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
          for (const row of itemsData as Array<{
            sale_id: string;
            product_name: string;
            quantity: number;
          }>) {
            qtyMap[row.sale_id] =
              (qtyMap[row.sale_id] ?? 0) + Number(row.quantity || 0);
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

      const formatMoney = (v: number) =>
        v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

      const headers = [
        "Data",
        "Nº Pedido",
        "Produtos",
        "Cliente",
        "Vendedor",
        "Status",
        "Quantidade",
        "Valor do Produto",
        "Custo Total",
        "Valor Líquido",
        "Valor Líquido após Comissão",
        "Entrada",
        "Faltante",
        "Status Pagamento",
      ];

      const escapeCSV = (val: unknown): string => {
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = data.map((sale: any) => {
        const costs = Number(sale.total_costs ?? 0);
        const total = Number(sale.total_price ?? 0);
        const entry = Number(sale.entry_value ?? 0);
        const paymentStatus = sale.payment_status ?? "pendente";
        const remaining =
          paymentStatus === "pago" ? 0 : Math.max(0, total - entry);
        const qty = qtyMap[sale.id] ?? sale.quantity ?? 0;
        const products = productMap[sale.id] || sale.product_name || "-";
        const salespersons = (sale.salespersons ?? [])
          .map((p: any) => p.name)
          .join(", ");

        const netValue = total - costs;
        const totalCommission = (sale.salespersons ?? []).reduce(
          (sum: number, p: any) =>
            sum + (netValue * Number(p.commission_percent || 0)) / 100,
          0,
        );
        const netAfterCommission = netValue - totalCommission;

        return [
          sale.sale_date ? formatBR(sale.sale_date) : "-",
          sale.order_number || "-",
          products,
          sale.customer_name || "-",
          salespersons || "-",
          sale.status === "concluída" ? "Concluída" : "Pendente",
          String(qty),
          formatMoney(total),
          formatMoney(costs),
          formatMoney(netValue),
          formatMoney(netAfterCommission),
          entry > 0 ? formatMoney(entry) : "-",
          formatMoney(remaining),
          paymentStatus === "pago" ? "Pago" : "Pendente",
        ].map(escapeCSV);
      });

      const csvContent =
        "\uFEFF" + [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join(
          "\n",
        );

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vendas-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`${data.length} vendas exportadas`, {
        position: "top-center",
      });
    } catch(error) {
      console.log(error)
      toast.error("Erro ao exportar vendas", { position: "top-center" });
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    !!searchTerm || !!appliedSearch || !!dateFilter || onlyWithRemaining || !!salespersonFilter || !!statusFilter;

  // ── Cálculos dos cards de estatísticas ────────────────────────
  const completedSales = sales.filter((s) => s.status === "concluída");
  const pendingSales = sales.filter((s) => s.status === "pendente");

  const completedRevenue = completedSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );
  const pendingRevenue = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );

  const completedCosts = completedSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );
  const pendingCosts = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );

  const completedNetProfit = completedRevenue - completedCosts;
  const pendingNetProfit = pendingRevenue - pendingCosts;

  const paymentsCompleted = sales.filter((s) => s.payment_status === "pago");
  const paymentsPending = sales.filter((s) => s.payment_status !== "pago");

  const totalMissingPayments = paymentsPending.reduce((sum, s) => {
    const total = Number(s.total_price ?? 0);
    const entry = Number(s.entry_value ?? 0);
    return sum + Math.max(total - entry, 0);
  }, 0);

  const totalPages = Math.ceil(tableTotal / TABLE_PAGE_SIZE);

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
                  {completedSales.length} vendas aprovadas
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
                  {completedSales.reduce((sum, sale) => sum + sale.quantity, 0)}
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
                  {pendingSales.length} vendas aguardando
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
                  {pendingSales.reduce((sum, sale) => sum + sale.quantity, 0)}
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
                  {paymentsCompleted.length}
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
                  {paymentsPending.length}
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
            onPaymentConfirmed={(saleId) => {
              // Atualiza otimisticamente nos dois estados
              const patch = (prev: SaleWithDetails[]) =>
                prev.map((s) =>
                  s.id === saleId
                    ? ({ ...(s as any), payment_status: "pago" } as any)
                    : s,
                );
              setTableSales(patch);
              setSales(patch);
            }}
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
          userId={userId}
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
