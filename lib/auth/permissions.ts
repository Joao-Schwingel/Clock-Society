// Catálogo de permissões — espelha public.role_permissions (seed na migration 013).
// A-PERM-01 compara este arquivo com o SQL; alterar um sem o outro quebra o teste.
// Spec: specs/release-2/fase-2-casos-de-teste-admin.md §3.1.

export const PERMISSIONS = [
  "dashboard.overview",
  "commissions.view",
  "sales.view",
  "sales.view_costs",
  "sales.write",
  "sales.export",
  "inventory.view",
  "inventory.write",
  "fixed_costs.manage",
  "contracts.manage",
  "salespersons.manage",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const APP_ROLES = ["admin", "vendedor"] as const
export type AppRole = (typeof APP_ROLES)[number]

// Fase 3 (D-6): só o admin é funcional. As permissões do vendedor entram na Fase 6.
export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  vendedor: [],
}

function isAppRole(role: string): role is AppRole {
  return (APP_ROLES as readonly string[]).includes(role)
}

export function permissionsForRole(role: string | null | undefined): Permission[] {
  if (!role || !isAppRole(role)) return []
  return [...ROLE_PERMISSIONS[role]]
}

export function hasPermission(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission)
}
