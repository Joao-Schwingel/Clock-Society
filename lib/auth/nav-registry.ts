// Registro de navegação: cada aba declara a permissão que exige. As telas montam as abas a partir
// daqui, e não de listas fixas. O bloqueio de aba via URL (?tab=/?company=, N11) também sai daqui;
// a proteção real continua sendo o RLS.

import { hasPermission, type Permission } from "./permissions"

export interface NavEntry {
  value: string
  label: string
  // Sem permissão = sempre visível (ex.: abas de empresa, que já vêm filtradas pelo RLS).
  permission?: Permission
}

// Subabas de cada empresa, na ordem de exibição.
export const COMPANY_SUBTABS: NavEntry[] = [
  { value: "dashboard", label: "Dashboard", permission: "dashboard.overview" },
  { value: "vendas", label: "Vendas", permission: "sales.view" },
  { value: "estoque", label: "Estoque", permission: "inventory.view" },
  { value: "custos-fixos", label: "Custos", permission: "fixed_costs.manage" },
]

// Abas de nível superior que não são empresas, exibidas depois delas.
export const TOP_LEVEL_PAGES: NavEntry[] = [
  { value: "contracts", label: "Contratos", permission: "contracts.manage" },
]

export const SETTINGS_PERMISSION: Permission = "salespersons.manage"

function isAllowed(entry: NavEntry, permissions: readonly Permission[]) {
  return !entry.permission || hasPermission(permissions, entry.permission)
}

export function companySubTabs(permissions: readonly Permission[]): NavEntry[] {
  return COMPANY_SUBTABS.filter((t) => isAllowed(t, permissions))
}

// Empresas (na ordem recebida — o servidor já ordena por code) seguidas das páginas permitidas.
// Sem nenhuma subaba permitida, as abas de empresa não aparecem.
export function topLevelTabs(
  companies: ReadonlyArray<{ code: string; name: string }>,
  permissions: readonly Permission[],
): NavEntry[] {
  const companyTabs = companySubTabs(permissions).length > 0
    ? companies.map((c) => ({ value: c.code, label: c.name }))
    : []
  return [...companyTabs, ...TOP_LEVEL_PAGES.filter((t) => isAllowed(t, permissions))]
}

export type TabResolution = { kind: "tab"; value: string } | { kind: "denied" }

// Resolve o valor pedido na URL contra o registro:
// - aba conhecida e permitida → a aba;
// - aba conhecida e NÃO permitida → acesso negado (não cai silenciosamente em outra aba);
// - vazio ou desconhecido → a primeira aba permitida (ou negado, se não houver nenhuma).
export function resolveTab(
  requested: string | null | undefined,
  entries: readonly NavEntry[],
  permissions: readonly Permission[],
): TabResolution {
  const known = requested ? entries.find((e) => e.value === requested) : undefined
  if (known) return isAllowed(known, permissions) ? { kind: "tab", value: known.value } : { kind: "denied" }

  const first = entries.find((e) => isAllowed(e, permissions))
  return first ? { kind: "tab", value: first.value } : { kind: "denied" }
}

export function canOpenSettings(permissions: readonly Permission[]): boolean {
  return hasPermission(permissions, SETTINGS_PERMISSION)
}
