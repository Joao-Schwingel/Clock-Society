// Sessão do app no front (spec Fase 2 §3.2). `userId` é só para exibição: nenhum filtro ou
// inserção usa o id do usuário logado (N3) — o inquilino vem do banco (RLS + default de user_id).

import { permissionsForRole, type Permission } from "./permissions"
import type { SessionClaims } from "./route-guard"

export interface AppSession {
  userId: string
  tenantId: string | null
  role: string | null
  // Registros de vendedor vinculados ao login. Sempre vazio na Fase 3 (D-6); preenchido na Fase 6.
  salespersonIds: string[]
  permissions: Permission[]
}

type JwtClaims = { sub?: string; app_metadata?: Record<string, unknown> }

// Lê app_role/tenant_id das claims do access token (§3.3). `auth.getUser()` não enxerga essas
// claims (N10): elas são injetadas pelo custom access token hook só no JWT.
export function claimsFromJwt(claims: JwtClaims | null | undefined): SessionClaims {
  const meta = claims?.app_metadata
  return {
    appRole: typeof meta?.app_role === "string" && meta.app_role ? meta.app_role : null,
    tenantId: typeof meta?.tenant_id === "string" && meta.tenant_id ? meta.tenant_id : null,
    // Decisão 3.6: o hook põe a marca no token, e o middleware força a troca sem consultar o banco.
    mustChangePassword: meta?.must_change_password === true,
  }
}

// O catálogo de permissões do front é o espelho de role_permissions (A-PERM-01), então a sessão
// deriva as permissões do papel sem consultar o banco.
export function sessionFromJwt(claims: JwtClaims): AppSession {
  const { appRole, tenantId } = claimsFromJwt(claims)
  return {
    userId: claims.sub ?? "",
    tenantId,
    role: appRole,
    salespersonIds: [],
    permissions: permissionsForRole(appRole),
  }
}
