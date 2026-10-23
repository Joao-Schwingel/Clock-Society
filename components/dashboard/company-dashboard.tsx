"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Company } from "@/lib/types";
import { SalesView } from "./sales-view";
import { InventoryView } from "./inventory-view";
import { DashboardView } from "./dashboard-view";
import { FixedCostsView } from "./fixed-costs-view";
import { useTabWithQuery } from "@/hooks/use-queryTab";
import { usePermissions } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/access-denied";
import { COMPANY_SUBTABS, companySubTabs, resolveTab } from "@/lib/auth/nav-registry";

interface CompanyDashboardProps {
  company: Company;
}

export function CompanyDashboard({ company }: CompanyDashboardProps) {
  const { permissions } = usePermissions();
  // Subabas vêm do registro (lib/auth/nav-registry.ts), na ordem dele.
  const subTabs = companySubTabs(permissions);
  const { tab, setTab } = useTabWithQuery("tab", subTabs[0]?.value ?? "dashboard");
  const resolution = resolveTab(tab, COMPANY_SUBTABS, permissions);

  const content: Record<string, ReactNode> = {
    dashboard: <DashboardView companyId={company.id} />,
    vendas: <SalesView companyId={company.id} />,
    estoque: <InventoryView companyId={company.id} />,
    "custos-fixos": <FixedCostsView companyId={company.id} />,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{company.name}</h2>
        <p className="text-muted-foreground">
          Gerencie vendas e estoque da empresa
        </p>
      </div>

      <Tabs
        value={resolution.kind === "tab" ? resolution.value : tab}
        onValueChange={setTab}
        id="ContentTabs"
        className="space-y-4"
      >
        <TabsList>
          {subTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {resolution.kind === "denied" ? (
          <AccessDenied />
        ) : (
          subTabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="space-y-4">
              {content[t.value]}
            </TabsContent>
          ))
        )}
      </Tabs>
    </div>
  );
}
