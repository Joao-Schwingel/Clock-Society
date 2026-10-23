import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { SessionProvider } from "@/lib/auth/session-provider"
import { sessionFromJwt } from "@/lib/auth/session"

export default async function DashboardPage() {
  const supabase = await createClient()

  // Papel e inquilino vêm das claims do token (§3.3) — getUser() não as enxerga (N10).
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    redirect("/auth/login")
  }
  const session = sessionFromJwt(data.claims)

  // Sem filtro pelo id do usuário logado (N3, A-BOOT-02): o RLS devolve as empresas do inquilino.
  // Sem empresas, o layout mostra o estado vazio — nada é criado (N4, A-BOOT-01).
  const { data: companies } = await supabase.from("companies").select("*").order("code")

  return (
    <SessionProvider session={session}>
      <DashboardLayout companies={companies ?? []} />
    </SessionProvider>
  )
}
