// Emulação mínima do RLS da Fase 3 (scripts/015_rewrite_policies.sql) no mock do PostgREST.
// NÃO substitui o checklist MANUAL (docs/manual-checklists/fase-2-checklist-banco-admin.md): só
// garante que a tela, sem mais filtrar por user_id (N3), recebe o que o banco real devolveria.
//
// Quem chama:
// - sem header Authorization → o próprio harness de teste (request.get/delete do Playwright),
//   que inspeciona o estado como o service_role: sem RLS;
// - Bearer <anon key> (supabase-js sem sessão) → anon, sem acesso. Simplificação: em produção o anon
//   ainda lê as views e as tabelas filhas (issue #9, fora do escopo); nenhum teste depende disso;
// - Bearer <JWT de usuário> → RLS: só o admin do inquilino lê e escreve.

import { decodeFakeToken } from "./auth.mjs";

// Tabelas com user_id (= inquilino). sale_items e sale_salespersons herdam da venda-mãe.
const TENANT_TABLES = new Set([
  "companies", "sales", "sale_costs", "salespersons", "inventory", "costs", "fixed_costs", "contracts",
]);
const CHILD_OF_SALE = new Set(["sale_items", "sale_salespersons"]);

export function authContext(req, profiles, anonKey) {
  const header = req.headers["authorization"];
  if (!header) return { kind: "service" };
  const token = header.replace(/^Bearer\s+/i, "");
  if (token === anonKey) return { kind: "anon" };

  const payload = decodeFakeToken(token);
  if (!payload?.sub) return { kind: "anon" };

  // Mesma regra de current_tenant_id()/current_app_role(): claim do token, senão o perfil ativo.
  const profile = profiles.find((p) => p.id === payload.sub && p.is_active);
  const tenantId = payload.app_metadata?.tenant_id || profile?.tenant_id || null;
  const role = payload.app_metadata?.app_role || profile?.role || null;
  return { kind: "user", tenantId, isAdmin: role === "admin" };
}

function saleVisible(tables, ctx, saleId) {
  const sale = tables.sales.find((s) => s.id === saleId);
  return Boolean(sale) && sale.user_id === ctx.tenantId;
}

// using/with check das políticas "*_tenant_admin_all".
export function rowAllowed(tables, ctx, table, row) {
  if (ctx.kind === "service") return true;
  if (ctx.kind !== "user" || !ctx.isAdmin || !ctx.tenantId) return false;
  if (TENANT_TABLES.has(table)) return row.user_id === ctx.tenantId;
  if (CHILD_OF_SALE.has(table)) return saleVisible(tables, ctx, row.sale_id);
  // Views: o mock aplica as políticas de sales, como se tivessem security_invoker (em produção ainda
  // não têm; para o admin único do inquilino o resultado é o mesmo).
  if (table === "sales_with_details" || table === "sales_with_salespersons") return saleVisible(tables, ctx, row.id);
  return false;
}

// Default da coluna user_id = current_tenant_id() (decisão 3.6).
export function applyInsertDefaults(ctx, table, row) {
  if (TENANT_TABLES.has(table) && row.user_id === undefined && ctx.kind === "user") {
    return { ...row, user_id: ctx.tenantId };
  }
  return row;
}

export function permissionDenied(table) {
  return {
    code: "42501",
    message: `new row violates row-level security policy for table "${table}"`,
  };
}
