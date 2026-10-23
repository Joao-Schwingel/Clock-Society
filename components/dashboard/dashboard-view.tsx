"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
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

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, months, year]);

  const loadData = async () => {
    setIsLoading(true);
    const supabase = createClient();

    try {
      // ── Monta filtro de data ──────────────────────────────────
      const dateOr = buildSaleDateRangeFilter(months, year);

      // ── Queries paralelas ─────────────────────────────────────
      // Receita e custos das vendas vêm de sales_with_details (total_costs já agregado); o cálculo
      // de comissões saiu do navegador para a RPC.
      let salesQ = supabase
        .from("sales_with_details")
        .select("id, total_price, total_costs")
        .eq("company_id", companyId)
        .eq("status", "concluída");

      if (dateOr) salesQ = salesQ.or(dateOr);

      const [{ data: salesRaw, error: salesError }, { data: fixedCostsData }] = await Promise.all([
        salesQ,
        supabase
          .from("fixed_costs")
          .select("monthly_value, start_date, qtdmonths")
          .eq("company_id", companyId),
      ]);

      if (salesError) throw salesError;

      const sales = (salesRaw ?? []) as { total_price: number; total_costs: number }[];

      // ── Totais ────────────────────────────────────────────────
      const revenue = sales.reduce((sum, s) => sum + Number(s.total_price ?? 0), 0);
      const saleCostsTotal = sales.reduce((sum, s) => sum + Number(s.total_costs ?? 0), 0);
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
    } finally {
      setIsLoading(false);
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
