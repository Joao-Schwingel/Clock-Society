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
import { useQueryTab } from "@/hooks/use-queryTab"

interface DashboardLayoutProps {
  companies: Company[]
  user: User
}

export function DashboardLayout({ companies, user }: DashboardLayoutProps) {
  // const [activeTab, setActiveTab] = useState<string>(companies[0]?.code)
  const [showSettings, setShowSettings] = useState(false)
  const router = useRouter()
  const { value: tab, setValue: setTab } = useQueryTab("company", "A")

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
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
        <Tabs id="CompaniesTabs" value={tab} onValueChange={setTab}>
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
              {company && <CompanyDashboard company={company} userId={user.id} />}
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
