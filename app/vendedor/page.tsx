import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { VendorLayout } from "@/components/vendor/vendor-layout"
import { SessionProvider } from "@/lib/auth/session-provider"
import { sessionFromJwt } from "@/lib/auth/session"

// Área do vendedor (Fase 6, fatia 6.8). O middleware só deixa entrar o papel vendedor.
export default async function VendorPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    redirect("/auth/login")
  }
  const session = sessionFromJwt(data.claims)

  // O RLS (020) devolve só as empresas em que o vendedor atua.
  const { data: companies } = await supabase.from("companies").select("*").order("code")

  return (
    <SessionProvider session={session}>
      <VendorLayout companies={companies ?? []} />
    </SessionProvider>
  )
}
