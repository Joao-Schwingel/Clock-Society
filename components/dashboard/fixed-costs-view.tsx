"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { FixedCost } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FixedCostForm } from "./fixed-cost-form";
import { FixedCostTable } from "./fixed-cost-table";
import { DollarSign, Calendar, TrendingUp } from "lucide-react";

interface FixedCostsViewProps {
  companyId: string;
  userId: string;
}

export function FixedCostsView({ companyId, userId }: FixedCostsViewProps) {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createBrowserClient();

  const fetchFixedCosts = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("fixed_costs")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .order("start_date", { ascending: true });

    if (!error && data) {
      setFixedCosts(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFixedCosts();
  }, [companyId, userId]);

  const handleFixedCostAdded = () => {
    fetchFixedCosts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("fixed_costs").delete().eq("id", id);

    if (!error) {
      fetchFixedCosts();
    }
  };

  const totalMonthly = fixedCosts
    .filter((x) => {
      const [year, month, day] = x.start_date.split("-").map(Number);

      const d = new Date(year, month - 1, day);
      const now = new Date();
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, cost) => sum + Number(cost.monthly_value), 0);

  function calculateRemaningMonths(cost: FixedCost) {
    const month = cost.start_date.split("-")[1];

    return cost.qtdmonths - (12 - Number(month) + 1);
  }

  function getMonthsInCurrentYear(cost: FixedCost) {
    const [year, month, day] = cost.start_date.split("-").map(Number);

    const start = new Date(year, month - 1, day);
    const end = new Date(start);
    end.setMonth(end.getMonth() + cost.qtdmonths);

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

    const effectiveStart = start > yearStart ? start : yearStart;
    const effectiveEnd = end < yearEnd ? end : yearEnd;

    if (effectiveStart >= effectiveEnd) return 0;

    return (
      (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
      (effectiveEnd.getMonth() - effectiveStart.getMonth())
    );
  }

  function calculateTotalAnnual() {
    return fixedCosts.reduce((total, cost) => {
      const months = getMonthsInCurrentYear(cost);
      return total + cost.monthly_value * months;
    }, 0);
  }

  const totalAnnual = calculateTotalAnnual();
  const costCount = fixedCosts.length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold">Custos Fixos</h3>
        <p className="text-sm text-muted-foreground">
          Gerencie custos fixos mensais como salários, aluguéis e tráfego pago
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensal Médio</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R${" "}
              {totalMonthly.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Custos fixos mensais
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Anual</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R${" "}
              {totalAnnual.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground">Projeção anual</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Quantidade Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{costCount}</div>
            <p className="text-xs text-muted-foreground">Custos cadastrados</p>
          </CardContent>
        </Card>
      </div>

      <FixedCostForm
        companyId={companyId}
        userId={userId}
        onFixedCostAdded={handleFixedCostAdded}
      />

      <FixedCostTable
        fixedCosts={fixedCosts}
        onDelete={handleDelete}
        isLoading={isLoading}
      />
    </div>
  );
}
