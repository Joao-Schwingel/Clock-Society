"use client";

import { useState } from "react";
import { DashboardFilters } from "@/components/dashboard/dashboards-filters";
import { CommissionsBySalesperson } from "@/components/dashboard/commissions-by-salesperson";
import { useCommissionSummary } from "@/hooks/use-commission-summary";

// Aba Comissões do vendedor (planejamento 4.5; Fase 6, fatia 6.8). O mesmo componente do Dashboard
// do admin; a RPC devolve os colegas sem a comissão e sem o inativo (#13).
export function VendorCommissionsView({ companyId }: { companyId: string }) {
  const [months, setMonths] = useState<number[]>([]);
  const [year, setYear] = useState("2026");
  const { rows, isLoading } = useCommissionSummary(companyId, months, year);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DashboardFilters value={months} yearValue={year} onChange={setMonths} onYearChange={setYear} />
      </div>
      <CommissionsBySalesperson rows={rows} isLoading={isLoading} />
    </div>
  );
}
