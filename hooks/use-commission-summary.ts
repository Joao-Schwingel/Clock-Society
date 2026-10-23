"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toRpcMonths, type CommissionRow } from "@/lib/calc/commissions";

// Comissões por vendedor via commission_summary() — a mesma fonte para o admin e para o vendedor
// (Fase 6, fatia 6.4). Quem vê o quê é decidido pela RPC, não aqui.
export function useCommissionSummary(companyId: string, months: number[], year: string) {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const monthsKey = months.join(",");

  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc("commission_summary", {
        p_company_id: companyId,
        p_year: Number(year),
        p_months: toRpcMonths(months),
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Erro ao carregar comissões:", error);
        setRows(((data as CommissionRow[] | null) ?? []).map((r) => ({
          ...r,
          sales_count: Number(r.sales_count),
          total_sales: Number(r.total_sales),
          total_costs: Number(r.total_costs),
          net_profit: Number(r.net_profit),
          total_commission: r.total_commission === null ? null : Number(r.total_commission),
        })));
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, monthsKey, year]);

  return { rows, isLoading };
}
