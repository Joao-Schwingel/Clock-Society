"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { LogOut, Building2, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { Company } from "@/lib/types"
import { CompanyDashboard } from "./company-dashboard"
import { ContractsView } from "./contracts-view"
import { SettingsModal } from "./settings-modal"
import { useTabWithQuery } from "@/hooks/use-queryTab"
import { usePermissions } from "@/hooks/use-permissions"
import { Can } from "@/components/can"
import { AccessDenied } from "@/components/access-denied"
import { SETTINGS_PERMISSION, TOP_LEVEL_PAGES, resolveTab, topLevelTabs } from "@/lib/auth/nav-registry"

interface DashboardLayoutProps {
  companies: Company[]
}

export function DashboardLayout({ companies }: DashboardLayoutProps) {
  const [showSettings, setShowSettings] = useState(false)
  const router = useRouter()
  const { permissions } = usePermissions()

  // Abas visíveis vêm do registro; a resolução da URL considera também as que o papel não pode
  // ver, para mostrar "acesso negado" em vez de cair silenciosamente em outra aba (N11).
  const visibleTabs = topLevelTabs(companies, permissions)
  const allEntries = [...companies.map((c) => ({ value: c.code, label: c.name })), ...TOP_LEVEL_PAGES]
  const { tab, setTab } = useTabWithQuery("company", visibleTabs[0]?.value ?? "")
  const resolution = resolveTab(tab, allEntries, permissions)

  const handleLogout = () => {
    const supabase = createClient()
    supabase.auth.signOut()
    router.replace("/auth/login")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex items-center gap-4">
              <Can permission={SETTINGS_PERMISSION}>
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Button>
              </Can>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {companies.length === 0 && (
          // Sem empresas: estado vazio, sem criar nada (N4, A-BOOT-01). As páginas que não dependem
          // de empresa (ex.: Contratos, do inquilino) continuam acessíveis abaixo.
          <p className="py-16 text-center text-muted-foreground">Nenhuma empresa disponível.</p>
        )}
        {visibleTabs.length > 0 && (
          <Tabs
            id="CompaniesTabs"
            value={resolution.kind === "tab" ? resolution.value : tab}
            onValueChange={setTab}
          >
            <TabsList
              className="grid w-full max-w-2xl mb-6"
              style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
            >
              {visibleTabs.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value}>
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {resolution.kind === "denied" ? (
              <AccessDenied />
            ) : (
              <>
                {companies.map((company) => (
                  <TabsContent key={company.id} value={company.code}>
                    <CompanyDashboard company={company} />
                  </TabsContent>
                ))}

                <TabsContent value="contracts">
                  <ContractsView />
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </main>

      {showSettings && <SettingsModal companies={companies} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
