"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessDenied } from "@/components/access-denied";
import { InventoryView } from "@/components/dashboard/inventory-view";
import { useTabWithQuery } from "@/hooks/use-queryTab";
import { usePermissions } from "@/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { ALL_SUBTABS, TOP_LEVEL_PAGES, resolveTab, topLevelTabs, vendorSubTabs } from "@/lib/auth/nav-registry";
import type { Company } from "@/lib/types";
import { VendorSalesView } from "./vendor-sales-view";
import { VendorCommissionsView } from "./vendor-commissions-view";

// Área do vendedor (planejamento 4.3, Anexo C; Fase 6, fatia 6.8; decisão 3.8).
export function VendorLayout({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const { permissions } = usePermissions();

  // Empresas = as que o RLS devolveu (só as em que o vendedor atua). ?company= de uma página do admin
  // (Contratos, Usuários) resolve para acesso negado (V-MW-03).
  const companyTabs = topLevelTabs(companies, permissions);
  const allEntries = [...companies.map((c) => ({ value: c.code, label: c.name })), ...TOP_LEVEL_PAGES];
  const { tab, setTab } = useTabWithQuery("company", companyTabs[0]?.value ?? "");
  const resolution = resolveTab(tab, allEntries, permissions);

  const handleLogout = () => {
    void createClient().auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Building2 className="h-6 w-6 text-primary" />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {companies.length === 0 ? (
          // Sem vínculo (V-UI-03): estado vazio, sem erro.
          <p className="py-16 text-center text-muted-foreground">
            Nenhuma empresa vinculada ao seu usuário. Fale com o administrador.
          </p>
        ) : (
          <Tabs value={resolution.kind === "tab" ? resolution.value : tab} onValueChange={setTab}>
            {/* Seletor de empresa só para quem atua em mais de uma (V-UI-02) */}
            {companyTabs.length > 1 && (
              <TabsList className="mb-6">
                {companyTabs.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value}>
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
            {resolution.kind === "denied" ? (
              <AccessDenied />
            ) : (
              companies.map((company) => (
                <TabsContent key={company.id} value={company.code}>
                  <VendorCompanyArea company={company} />
                </TabsContent>
              ))
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}

function VendorCompanyArea({ company }: { company: Company }) {
  const { permissions } = usePermissions();
  const subTabs = vendorSubTabs(permissions);
  const { tab, setTab } = useTabWithQuery("tab", subTabs[0]?.value ?? "vendas");
  // Resolve contra TODAS as subabas: ?tab=custos-fixos (do admin) vira acesso negado (V-MW-03).
  const resolution = resolveTab(tab, ALL_SUBTABS, permissions);

  const content: Record<string, ReactNode> = {
    vendas: <VendorSalesView companyId={company.id} />,
    comissoes: <VendorCommissionsView companyId={company.id} />,
    estoque: <InventoryView companyId={company.id} readOnly />,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">{company.name}</h2>
      <Tabs value={resolution.kind === "tab" ? resolution.value : tab} onValueChange={setTab} className="space-y-4">
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
