"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { FixedCost } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FixedCostForm } from "./fixed-cost-form";
import { FixedCostTable } from "./fixed-cost-table";
import { DollarSign, Calendar, TrendingUp } from "lucide-react";
import {
  sumActiveFixedCostsInMonth,
  sumFixedCostsAnnualTotal,
} from "@/lib/calc/fixed-costs";

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

  const now = new Date();
  const currentYM = now.getFullYear() * 12 + now.getMonth();

  const totalMonthly = sumActiveFixedCostsInMonth(fixedCosts, currentYM);
  const totalAnnual = sumFixedCostsAnnualTotal(fixedCosts, now.getFullYear());
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
