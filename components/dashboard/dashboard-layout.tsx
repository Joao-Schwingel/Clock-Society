"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { LogOut, Building2, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { Company } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { CompanyDashboard } from "./company-dashboard"
import { ContractsView } from "./contracts-view"
import { SettingsModal } from "./settings-modal"

interface DashboardLayoutProps {
  companies: Company[]
  user: User
}

export function DashboardLayout({ companies, user }: DashboardLayoutProps) {
  const [activeTab, setActiveTab] = useState<string>(companies[0]?.code || "A")
  const [showSettings, setShowSettings] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const currentCompany = companies.find((c) => c.code === activeTab)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Sistema de Gestão</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-6">
            {companies.map((company) => (
              <TabsTrigger key={company.id} value={company.code}>
                {company.name}
              </TabsTrigger>
            ))}
            <TabsTrigger value="contracts">Contratos</TabsTrigger>
          </TabsList>

          {companies.map((company) => (
            <TabsContent key={company.id} value={company.code}>
              {currentCompany && <CompanyDashboard company={currentCompany} userId={user.id} />}
            </TabsContent>
          ))}

          <TabsContent value="contracts">
            <ContractsView userId={user.id} />
          </TabsContent>
        </Tabs>
      </main>

      {showSettings && <SettingsModal userId={user.id} companies={companies} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
