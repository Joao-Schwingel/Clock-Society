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
import type { Salesperson } from "@/lib/types";
import {
  DollarSign,
  TrendingUp,
  Users,
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

type SalespersonSummary = {
  salesperson_id: string;
  salesperson_name: string;
  sales_count: number;
  total_sales: number;
  total_costs: number;
  net_profit: number;
  total_commission: number;
};


type SalespersonCommission = {
  salesperson: {
    id: string;
    name: string;
  };
  totalCost: number;
  totalSales: number;
  netProfit: number;
  totalCommission: number;
  salesCount: number;
};

export function DashboardView({ companyId, userId }: DashboardViewProps) {
  const [commissions, setCommissions] = useState<SalespersonCommission[]>([]);
  // const [saleSellers, setSaleSellers] = useState<SalespersonSummary[]>([]);
  const [salePeople, setSalePeople] = useState([
    { name: "", is_active: false, id: "" },
  ]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [completedCosts, setTotalSaleCosts] = useState(0);
  const [totalFixedCosts, setTotalFixedCosts] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [months, setMonths] = useState<number[]>(() => [new Date().getMonth()]);
  const [year, setYear] = useState("2026");

  useEffect(() => {
    loadCommissionData();
  }, [companyId, userId, months, year]);

  function filterFixedCosts(fixedCosts: any) {
    let total = 0;

    for (const cost of fixedCosts) {
      const start = new Date(cost.start_date);
      for (const month of months) {
        if (
          start.getMonth() == month ||
          (start.getMonth() < month &&
            start.getMonth() + cost.qtdmonths - 1 >= month)
        ) {
          total += cost.monthly_value;
        }
      }
    }

    return total;
  }

  const loadCommissionData = async () => {
    setIsLoading(true);
    const supabase = createClient();

    try {
      const { data: salespersons, error: salespersonsError } = await supabase
        .from("salespersons")
        .select("name, is_active, id")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name");

      if (salespersonsError) throw salespersonsError;
      setSalePeople(salespersons);

      let query = supabase
        .from("sales")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("status", "concluída");

      if (months.length > 0) {
        const ranges = months.map((m) => {
          const start = new Date(Number(year), m, 1);
          const end = new Date(Number(year), m + 1, 1);
          return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
        });

        query = query.or(ranges.join(","));
      }
      const { data: sales, error } = await query;

      if (error) throw error;

      const saleIds = sales?.map((s) => s.id) || [];
      const { data: saleCosts } = await supabase
        .from("sale_costs")
        .select("*")
        .in("sale_id", saleIds);

      const { data: fixedCosts } = await supabase
        .from("fixed_costs")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId);

      const saleCostsTotal =
        saleCosts?.reduce((sum, cost) => sum + Number(cost.amount), 0) || 0;

      const fixedCostsTotal = filterFixedCosts(fixedCosts);

      const { data, error: errorSummary } = await supabase.rpc(
        "salesperson_summary_by_months",
        {
          p_year: Number(year),
          p_months: months.map((month) => month + 1),
        },
      );

      if (errorSummary) throw errorSummary;

      const salesByPerson: SalespersonSummary[] = data ?? [];

      const totalComm = salesByPerson.reduce(
        (sum: number, x: SalespersonSummary) =>
          sum + Number(x.total_commission ?? 0),
        0,
      );

      const commissions: SalespersonCommission[] = salesByPerson.map((x) => ({
        salesperson: {
          id: x.salesperson_id,
          name: x.salesperson_name,
        },
        totalSales: Number(x.total_sales),
        totalCommission: Number(x.total_commission),
        salesCount: x.sales_count,
        netProfit: x.net_profit,
        totalCost: x.total_costs
      }));

      let revenue = sales.reduce(
        (sum, x) => sum + Number(x.total_price ?? 0),
        0,
      );

      const overallNetProfit = revenue - saleCostsTotal - fixedCostsTotal;

      setTotalRevenue(revenue);
      setNetProfit(overallNetProfit);
      setCommissions(commissions);
      setTotalCommissions(totalComm);
      setTotalSaleCosts(saleCostsTotal);
      setTotalFixedCosts(fixedCostsTotal);
    } catch (err) {
      console.error("Error loading commission data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // if (isLoading) {
  //   return <div className="text-center py-8">Carregando...</div>
  // }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton loading={isLoading}>
          <div className="flex gap-6 items-center justify-between mb-2">
            <h3 className="w-max text-2xl font-bold tracking-tight">
              Dashboard de Comissões
            </h3>
            <DashboardFilters
              value={months}
              yearValue={year}
              onChange={setMonths}
              onYearChange={setYear}
            ></DashboardFilters>
          </div>
        </Skeleton>
        <Skeleton loading={isLoading}>
          <p className="text-muted-foreground w-max">
            Comissões sobre lucro líquido (apenas vendas concluídas)
          </p>
        </Skeleton>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Skeleton className="rounded-xl" loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Total
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R${" "}
                {totalRevenue.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-muted-foreground">Vendas concluídas</p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos de Vendas
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                R${" "}
                {completedCosts.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Transporte, tarifas, etc
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Custos</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                R${" "}
                {totalFixedCosts.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Salários, aluguel, etc
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Lucro Líquido
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  netProfit >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                R${" "}
                {netProfit.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Após todos os custos
              </p>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Comissões Totais
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R${" "}
                {totalCommissions.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </CardContent>
          </Card>
        </Skeleton>

        <Skeleton loading={isLoading}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Vendedores Ativos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {salePeople.filter((c) => c.is_active == true).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Com vendas concluídas
              </p>
            </CardContent>
          </Card>
        </Skeleton>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {salePeople.map((person) => {
          const commission = commissions.find(
            (c) => c.salesperson.id === person.id,
          );
          const totalSales = commission?.totalSales ?? 0;
          const totalCommission = commission?.totalCommission ?? 0;
          const salesCount = commission?.salesCount ?? 0;
          const netProfit = commission?.netProfit ?? 0;
          const totalCosts = commission?.totalCost ?? 0

          return (
            <Skeleton key={person.id} loading={isLoading}>
              <Card>
                <CardHeader>
                  <CardTitle>{person.name}</CardTitle>
                  <CardDescription>
                    {salesCount} venda{salesCount !== 1 ? "s" : ""} concluída
                    {salesCount > 0
                      ? ` • Comissão de ${salesCount}`
                      : " • Sem comissão"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Total de Vendas:
                    </span>
                    <span className="font-medium">
                      R${" "}
                      {totalSales.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Custos das Vendas:
                    </span>
                    <span className="font-medium text-orange-600">
                      - R${" "}
                      {totalCosts.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Lucro Líquido</span>
                    <span className="font-medium text-primary">
                      R${" "}
                      {netProfit.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">
                      Comissão Total:
                    </span>
                    <span className="font-medium text-green-600">
                      R${" "}
                      {totalCommission.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Skeleton>
          );
        })}
      </div>
    </div>
  );
}
