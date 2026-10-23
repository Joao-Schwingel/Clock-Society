"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { toast } from "sonner";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Banknote,
} from "lucide-react";
import { Skeleton } from "@radix-ui/themes";
import { DashboardFilters } from "./dashboards-filters";
import { sumFixedCostsForPeriod } from "@/lib/calc/dashboard";
import { buildSaleDateRangeFilter } from "@/lib/calc/date-filters";
import { totalCommission } from "@/lib/calc/commissions";
import { useCommissionSummary } from "@/hooks/use-commission-summary";
import { CommissionsBySalesperson } from "./commissions-by-salesperson";

interface DashboardViewProps {
  companyId: string;
}

// Linha de `sales_with_details`: uma por venda, com o custo já somado no banco. Os vendedores não
// entram: desde a fatia 6.4 a comissão vem de commission_summary(), não do navegador.
type SaleRawRow = {
  id: string;
  total_price: number | string | null;
  total_costs: number | string | null;
};

export function DashboardView({ companyId }: DashboardViewProps) {
  const [months, setMonths] = useState<number[]>([]);
  const [year, setYear] = useState("2026");
  const [isLoading, setIsLoading] = useState(true);

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSaleCosts, setTotalSaleCosts] = useState(0);
  const [netRevenue, setNetRevenue] = useState(0);
  const [totalFixedCosts, setTotalFixedCosts] = useState(0);

  // Comissões por vendedor vêm de commission_summary() (Fase 6, fatia 6.4); o total soma todas as
  // linhas, inclusive a do inativo (N12).
  const { rows: commissionRows, isLoading: isLoadingCommissions } = useCommissionSummary(companyId, months, year);
  const totalCommissions = totalCommission(commissionRows);
  const netProfit = netRevenue - totalFixedCosts - totalCommissions;

  // Cada clique de mês dispara um loadData novo; só a resposta da requisição mais
  // recente pode atualizar a tela, senão uma resposta antiga sobrescreve a nova.
  const requestId = useRef(0);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, months, year]);

  const loadData = async () => {
    const currentRequest = ++requestId.current;
    const isStale = () => currentRequest !== requestId.current;

    setIsLoading(true);
    const supabase = createClient();

    try {
      // ── Monta filtro de data ──────────────────────────────────
      const dateOr = buildSaleDateRangeFilter(months, year);

      // ── Queries paralelas ─────────────────────────────────────
      // Mesma view da aba Vendas (`sales_with_details`): o custo de cada venda já vem somado pelo
      // banco em `total_costs`, então o Dashboard e a aba Vendas não têm como divergir. A paginação
      // é necessária porque o PostgREST corta a resposta em 1000 linhas sem erro nem aviso.
      // A lista de vendedores não é mais buscada aqui: as comissões vêm de commission_summary().
      const [salesRaw, { data: fixedCostsData, error: fixedCostsError }] = await Promise.all([
        fetchAllRows<SaleRawRow>((from, to) => {
          let salesQ = supabase
            .from("sales_with_details")
            .select("id, total_price, total_costs")
            .eq("company_id", companyId)
            .eq("status", "concluída");

          if (dateOr) salesQ = salesQ.or(dateOr);

          return salesQ.order("id").range(from, to);
        }),
        supabase
          .from("fixed_costs")
          .select("monthly_value, start_date, qtdmonths")
          .eq("company_id", companyId),
      ]);

      if (fixedCostsError) throw fixedCostsError;

      // Uma seleção de meses mais nova já disparou outro loadData: descarta este.
      if (isStale()) return;

      const sales = salesRaw.map((s) => ({
        total_price: Number(s.total_price ?? 0),
        total_costs: Number(s.total_costs ?? 0),
      }));

      // ── Totais ────────────────────────────────────────────────
      const revenue = sales.reduce((sum, s) => sum + s.total_price, 0);
      const saleCostsTotal = sales.reduce((sum, s) => sum + s.total_costs, 0);
      const fixedCostsTotal = sumFixedCostsForPeriod(
        (fixedCostsData ?? []) as { monthly_value: number; start_date: string; qtdmonths: number }[],
        months,
        year,
      );

      setTotalRevenue(revenue);
      setTotalSaleCosts(saleCostsTotal);
      setNetRevenue(revenue - saleCostsTotal);
      setTotalFixedCosts(fixedCostsTotal);
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
      // Sem isso a tela continuaria mostrando os números do filtro anterior como se fossem atuais.
      if (!isStale()) {
        toast.error("Erro ao carregar o dashboard. Tente novamente.", {
          position: "top-center",
        });
      }
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho com filtro ──────────────────────────────── */}
      <div className="flex gap-6 items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Dashboard</h3>
          <p className="text-sm text-muted-foreground">
            Apenas vendas concluídas
          </p>
        </div>
        <DashboardFilters
          value={months}
          yearValue={year}
          onChange={setMonths}
          onYearChange={setYear}
        />
      </div>

      {/* ── Cards principais (ordem: Receita → Comissões → Custos de Vendas → Despesas Gerais → Lucro) ── */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Skeleton className="rounded-xl" loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {fmt(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Vendas concluídas</p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receita Líquida</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {fmt(netRevenue)}</div>
              <p className="text-xs text-muted-foreground">Receita − custos de vendas</p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading || isLoadingCommissions}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões</CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                R$ {fmt(totalCommissions)}
              </div>
              <p className="text-xs text-muted-foreground">
                Total de comissões
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos de Vendas
              </CardTitle>
              <Receipt className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                R$ {fmt(totalSaleCosts)}
              </div>
              <p className="text-xs text-muted-foreground">
                Transporte, tarifas…
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos Gerais
              </CardTitle>
              <Banknote className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                R$ {fmt(totalFixedCosts)}
              </div>
              <p className="text-xs text-muted-foreground">
                Salários, aluguel…
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading || isLoadingCommissions}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lucro</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  netProfit >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                R$ {fmt(netProfit)}
              </div>
              <p className="text-xs text-muted-foreground">
                Receita − custos − fixos − comissões
              </p>
            </CardContent>
          </Card>
        </Skeleton>
      </div>

      {/* ── Comissões por vendedor (componente compartilhado com a área do vendedor) ── */}
      <CommissionsBySalesperson rows={commissionRows} isLoading={isLoading || isLoadingCommissions} />
    </div>
  );
}
