import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { decideRoute, type SessionClaims } from "@/lib/auth/route-guard"
import { claimsFromJwt } from "@/lib/auth/session"

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // Papel e inquilino vêm das claims do access token (spec Fase 2 §3.3): getUser() devolve o
  // registro do usuário, que não traz as claims injetadas pelo hook (N10). getClaims() valida o
  // token (JWKS, ou getUser() quando o token é HS256) e devolve o payload.
  const readClaims = async (jwt?: string): Promise<SessionClaims | null> => {
    const { data } = await supabase.auth.getClaims(jwt)
    return data?.claims ? claimsFromJwt(data.claims) : null
  }

  const { pathname } = request.nextUrl
  let decision = decideRoute({ pathname, session: await readClaims(), refreshed: false })

  // Token emitido antes do hook (sem claims): renova uma vez e decide de novo (A-MW-06).
  if (decision.action === "refresh") {
    const { data } = await supabase.auth.refreshSession()
    const session = data.session ? await readClaims(data.session.access_token) : null
    decision = decideRoute({ pathname, session, refreshed: true })
  }

  if (decision.action === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url))
    // Leva junto os cookies da sessão renovada, se houver.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}
