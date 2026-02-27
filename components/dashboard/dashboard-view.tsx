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

interface DashboardViewProps {
  companyId: string;
  userId: string;
}

type SalespersonEntry = {
  id: string;
  name: string;
  commission_percent: number;
};

type SaleRow = {
  id: string;
  total_price: number;
  salespersons: SalespersonEntry[];
};

type CommissionSummary = {
  id: string;
  name: string;
  salesCount: number;
  totalSales: number;
  totalCosts: number;
  netProfit: number;
  totalCommission: number;
};

export function DashboardView({ companyId, userId }: DashboardViewProps) {
  const [months, setMonths] = useState<number[]>([]);
  const [year, setYear] = useState("2026");
  const [isLoading, setIsLoading] = useState(true);

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSaleCosts, setTotalSaleCosts] = useState(0);
  const [netRevenue, setNetRevenue] = useState(0);
  const [totalFixedCosts, setTotalFixedCosts] = useState(0);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [netProfit, setNetProfit] = useState(0);

  const [commissionSummaries, setCommissionSummaries] = useState<
    CommissionSummary[]
  >([]);
  const [salePeople, setSalePeople] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId, months, year]);

  // Soma o valor de cada custo fixo nos meses selecionados do ano selecionado.
  // Quando months=[] (sem filtro), considera todos os 12 meses do ano selecionado.
  function sumFixedCostsForPeriod(
    fixedCosts: { monthly_value: number; start_date: string; qtdmonths: number }[],
  ): number {
    const activeMonths =
      months.length > 0 ? months : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    let total = 0;
    for (const cost of fixedCosts) {
      // start_date vem como "YYYY-MM-DD" — parse sem conversão de timezone
      const [sy, sm] = cost.start_date.split("-").map(Number);
      const startYearMonth = sy * 12 + (sm - 1); // sm é 1-based
      const endYearMonth = startYearMonth + cost.qtdmonths - 1;

      for (const month of activeMonths) {
        const filterYearMonth = Number(year) * 12 + month; // month é 0-based
        if (
          filterYearMonth >= startYearMonth &&
          filterYearMonth <= endYearMonth
        ) {
          total += Number(cost.monthly_value);
        }
      }
    }
    return total;
  }

  const loadData = async () => {
    setIsLoading(true);
    const supabase = createClient();

    try {
      // ── Monta filtro de data ──────────────────────────────────
      let dateOr: string | null = null;
      if (months.length > 0) {
        const ranges = months.map((m) => {
          const start = new Date(Number(year), m, 1);
          const end = new Date(Number(year), m + 1, 1);
          return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
        });
        dateOr = ranges.join(",");
      }

      // ── Queries paralelas ─────────────────────────────────────
      let salesQ = supabase
        .from("sales_with_salespersons")
        .select("id, total_price, salespersons")
        .eq("company_id", companyId)
        .eq("status", "concluída");

      if (dateOr) salesQ = salesQ.or(dateOr);

      const [
        { data: salespersonsData },
        { data: salesRaw, error: salesError },
        { data: fixedCostsData },
      ] = await Promise.all([
        supabase
          .from("salespersons")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        salesQ,
        supabase
          .from("fixed_costs")
          .select("monthly_value, start_date, qtdmonths")
          .eq("company_id", companyId)
          .eq("user_id", userId),
      ]);

      if (salesError) throw salesError;

      setSalePeople(salespersonsData ?? []);

      const sales: SaleRow[] = (salesRaw ?? []).map((s: any) => ({
        id: String(s.id),
        total_price: Number(s.total_price ?? 0),
        salespersons: Array.isArray(s.salespersons) ? (s.salespersons as SalespersonEntry[]) : [],
      }));

      // ── Custos de vendas ──────────────────────────────────────
      const costsBySaleId: Record<string, number> = {};
      const saleIds = sales.map((s) => s.id);

      if (saleIds.length > 0) {
        const { data: costsRaw } = await supabase
          .from("sale_costs")
          .select("sale_id, amount")
          .in("sale_id", saleIds);

        for (const c of (costsRaw ?? []) as { sale_id: string; amount: number }[]) {
          costsBySaleId[c.sale_id] = (costsBySaleId[c.sale_id] ?? 0) + Number(c.amount);
        }
      }

      // ── Totais ────────────────────────────────────────────────
      const revenue = sales.reduce((sum, s) => sum + s.total_price, 0);
      const saleCostsTotal = Object.values(costsBySaleId).reduce((sum, v) => sum + v, 0);
      const fixedCostsTotal = sumFixedCostsForPeriod(
        (fixedCostsData ?? []) as { monthly_value: number; start_date: string; qtdmonths: number }[],
      );

      // ── Comissões por vendedor ────────────────────────────────
      const commMap: Record<string, CommissionSummary> = {};

      for (const sale of sales) {
        const saleCost = costsBySaleId[sale.id] ?? 0;
        const saleNet = sale.total_price - saleCost;

        for (const sp of sale.salespersons) {
          if (!commMap[sp.id]) {
            commMap[sp.id] = {
              id: sp.id,
              name: sp.name,
              salesCount: 0,
              totalSales: 0,
              totalCosts: 0,
              netProfit: 0,
              totalCommission: 0,
            };
          }
          commMap[sp.id].salesCount += 1;
          commMap[sp.id].totalSales += sale.total_price;
          commMap[sp.id].totalCosts += saleCost;
          commMap[sp.id].netProfit += saleNet;
          commMap[sp.id].totalCommission += (saleNet * Number(sp.commission_percent)) / 100;
        }
      }

      const summaries = Object.values(commMap);
      const totalComm = summaries.reduce((sum, s) => sum + s.totalCommission, 0);

      setTotalRevenue(revenue);
      setTotalSaleCosts(saleCostsTotal);
      setNetRevenue(revenue - saleCostsTotal);
      setTotalFixedCosts(fixedCostsTotal);
      setTotalCommissions(totalComm);
      setNetProfit(revenue - saleCostsTotal - fixedCostsTotal - totalComm);
      setCommissionSummaries(summaries);
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

        <Skeleton loading={isLoading}>
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

        <Skeleton loading={isLoading}>
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

      {/* ── Comissões por vendedor ────────────────────────────── */}
      <div>
        <h4 className="text-lg font-semibold mb-3">Comissões por Vendedor</h4>
        <div className="grid gap-4 md:grid-cols-2">
          {salePeople.length === 0 && !isLoading && (
            <p className="text-muted-foreground col-span-2">
              Nenhum vendedor ativo cadastrado.
            </p>
          )}
          {salePeople.map((person) => {
            const s = commissionSummaries.find((c) => c.id === person.id);
            const totalSales = s?.totalSales ?? 0;
            const totalCosts = s?.totalCosts ?? 0;
            const personNet = s?.netProfit ?? 0;
            const totalCommission = s?.totalCommission ?? 0;
            const salesCount = s?.salesCount ?? 0;

            return (
              <Skeleton key={person.id} loading={isLoading}>
                <Card>
                  <CardHeader>
                    <CardTitle>{person.name}</CardTitle>
                    <CardDescription>
                      {salesCount} venda{salesCount !== 1 ? "s" : ""}{" "}
                      concluída{salesCount !== 1 ? "s" : ""}
                      {salesCount === 0 && " • Sem comissão no período"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Total de Vendas:
                      </span>
                      <span className="font-medium">R$ {fmt(totalSales)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Custos das Vendas:
                      </span>
                      <span className="font-medium text-orange-600">
                        − R$ {fmt(totalCosts)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Lucro Líquido:
                      </span>
                      <span className="font-medium text-primary">
                        R$ {fmt(personNet)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-muted-foreground">
                        Comissão Total:
                      </span>
                      <span className="font-medium text-green-600">
                        R$ {fmt(totalCommission)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Skeleton>
            );
          })}
        </div>
      </div>
    </div>
  );
}
