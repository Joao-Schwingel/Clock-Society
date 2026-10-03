// Tabela de decisão do middleware (spec Fase 2 §3.4), como função pura. O middleware
// (lib/supabase/middleware.ts) lê as claims do token e só aplica o resultado.

import { hasPermission, permissionsForRole, type Permission } from "./permissions"

export const LOGIN_ROUTE = "/auth/login"
export const FORBIDDEN_ROUTE = "/403"

// /auth/sign-up e /auth/sign-up-success deixaram de ser públicas (A-MW-03): o auto-cadastro está fechado.
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set(["/", LOGIN_ROUTE, "/auth/error"])

// Áreas protegidas por permissão. Rota autenticada fora daqui só exige ter um papel.
const PROTECTED_AREAS: ReadonlyArray<{ prefix: string; permission: Permission }> = [
  { prefix: "/dashboard", permission: "dashboard.overview" },
]

export interface SessionClaims {
  appRole: string | null
  tenantId: string | null
}

export type RouteDecision =
  | { action: "next" }
  | { action: "refresh" }
  | { action: "redirect"; to: string }

export function decideRoute({
  pathname,
  session,
  refreshed,
}: {
  pathname: string
  session: SessionClaims | null
  // true quando a sessão já foi renovada nesta requisição (renova no máximo uma vez).
  refreshed: boolean
}): RouteDecision {
  if (PUBLIC_ROUTES.has(pathname)) return { action: "next" }
  // As rotas de API fazem a própria autorização e respondem 401/403 (lib/users/auth.ts); redirecionar
  // para a página de login quebraria quem chama a API (V-API-02).
  if (pathname === "/api" || pathname.startsWith("/api/")) return { action: "next" }
  if (!session) return { action: "redirect", to: LOGIN_ROUTE }

  // Token emitido antes do hook (sem claims): renova uma vez; se continuar sem papel, é usuário
  // sem perfil → nega (A-MW-04/06).
  if (!session.appRole) {
    if (!refreshed) return { action: "refresh" }
    return pathname === FORBIDDEN_ROUTE ? { action: "next" } : { action: "redirect", to: FORBIDDEN_ROUTE }
  }

  // Na /403, quem tem papel com uma home de verdade não fica preso ali (A-MW-06: o login com
  // token antigo cai na /403, a sessão é renovada e ganha o papel).
  if (pathname === FORBIDDEN_ROUTE) {
    const home = homeForRole(session.appRole)
    return home === FORBIDDEN_ROUTE ? { action: "next" } : { action: "redirect", to: home }
  }

  const permissions = permissionsForRole(session.appRole)
  if (permissions.length === 0) return { action: "redirect", to: FORBIDDEN_ROUTE }

  const area = PROTECTED_AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`))
  if (area && !hasPermission(permissions, area.permission)) return { action: "redirect", to: FORBIDDEN_ROUTE }

  return { action: "next" }
}

// Destino depois do login, por papel — único lugar com essa regra (A-MW-05).
export function homeForRole(role: string | null | undefined): string {
  return role === "admin" ? "/dashboard" : FORBIDDEN_ROUTE
}
