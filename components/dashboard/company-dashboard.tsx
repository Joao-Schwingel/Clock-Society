"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Company } from "@/lib/types";
import { SalesView } from "./sales-view";
import { InventoryView } from "./inventory-view";
import { DashboardView } from "./dashboard-view";
import { FixedCostsView } from "./fixed-costs-view";
import { useTabWithQuery } from "@/hooks/use-queryTab";

interface CompanyDashboardProps {
  company: Company;
  userId: string;
}

export function CompanyDashboard({ company, userId }: CompanyDashboardProps) {
  const { tab,  setTab } = useTabWithQuery("tab", "dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{company.name}</h2>
        <p className="text-muted-foreground">
          Gerencie vendas e estoque da empresa
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} id="ContentTabs" defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="custos-fixos">Custos Fixos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardView companyId={company.id} userId={userId} />
        </TabsContent>

        <TabsContent value="vendas" className="space-y-4">
          <SalesView companyId={company.id} userId={userId} />
        </TabsContent>

        <TabsContent value="estoque" className="space-y-4">
          <InventoryView companyId={company.id} userId={userId} />
        </TabsContent>

        <TabsContent value="custos-fixos" className="space-y-4">
          <FixedCostsView companyId={company.id} userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
