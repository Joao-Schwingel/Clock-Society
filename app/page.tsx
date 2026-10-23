import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { homeForRole, LOGIN_ROUTE } from "@/lib/auth/route-guard"
import { claimsFromJwt } from "@/lib/auth/session"

export default async function HomePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect(LOGIN_ROUTE)
  }
  redirect(homeForRole(claimsFromJwt(data.claims).appRole))
}
