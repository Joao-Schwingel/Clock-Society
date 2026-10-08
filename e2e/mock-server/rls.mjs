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

export function authContext(req, profiles, anonKey, serviceKey) {
  const header = req.headers["authorization"];
  if (!header) return { kind: "service" };
  const token = header.replace(/^Bearer\s+/i, "");
  if (token === serviceKey) return { kind: "service" };
  if (token === anonKey) return { kind: "anon" };

  const payload = decodeFakeToken(token);
  if (!payload?.sub) return { kind: "anon" };

  // Mesma regra de current_tenant_id()/current_app_role() (020): perfil desativado não tem acesso
  // nem com token válido; senão, claim do token e, sem ela, o perfil ativo.
  const anyProfile = profiles.find((p) => p.id === payload.sub);
  if (anyProfile && !anyProfile.is_active) return { kind: "user", userId: payload.sub, tenantId: null, isAdmin: false, isVendor: false };
  const profile = anyProfile?.is_active ? anyProfile : undefined;
  const tenantId = payload.app_metadata?.tenant_id || profile?.tenant_id || null;
  const role = payload.app_metadata?.app_role || profile?.role || null;
  return { kind: "user", userId: payload.sub, tenantId, isAdmin: role === "admin", isVendor: role === "vendedor" };
}

function saleVisible(tables, ctx, saleId) {
  const sale = tables.sales.find((s) => s.id === saleId);
  return Boolean(sale) && sale.user_id === ctx.tenantId;
}

// my_salesperson_ids() / my_company_ids() da 020.
function vendorScope(tables, ctx) {
  const me = tables.profiles.find((p) => p.id === ctx.userId);
  const mine = new Set(
    me?.is_active && me.role === "vendedor"
      ? tables.profile_salespersons.filter((l) => l.profile_id === ctx.userId).map((l) => l.salesperson_id)
      : [],
  );
  const companies = new Set(tables.salespersons.filter((sp) => mine.has(sp.id)).map((sp) => sp.company_id));
  const canSeeSale = (saleId) => tables.sale_salespersons.some((ss) => ss.sale_id === saleId && mine.has(ss.salesperson_id));
  return { mine, companies, canSeeSale };
}

// Políticas de leitura do vendedor (020). Escrita do vendedor é recusada no servidor.
function vendorRowAllowed(tables, ctx, table, row) {
  const { mine, companies, canSeeSale } = vendorScope(tables, ctx);
  switch (table) {
    case "companies":
      return row.user_id === ctx.tenantId && companies.has(row.id);
    case "sales":
      return row.user_id === ctx.tenantId && canSeeSale(row.id);
    case "sale_items":
      return canSeeSale(row.sale_id);
    case "sale_salespersons":
      return mine.has(row.salesperson_id); // só as próprias linhas (V-DB-17)
    case "salespersons":
      return row.user_id === ctx.tenantId && mine.has(row.id);
    case "inventory":
      return row.user_id === ctx.tenantId && companies.has(row.company_id);
    default:
      return false; // sale_costs, fixed_costs, contracts, costs e as views antigas (só admin)
  }
}

// using/with check das políticas (015 para o admin, 020 para o vendedor).
export function rowAllowed(tables, ctx, table, row) {
  if (ctx.kind === "service") return true;
  if (ctx.kind !== "user" || !ctx.tenantId) return false;
  // profiles (013): o próprio perfil; o admin lê os do inquilino.
  if (table === "profiles") return row.id === ctx.userId || (ctx.isAdmin && row.tenant_id === ctx.tenantId);
  // profile_salespersons (014): os próprios vínculos; o admin lê os do inquilino.
  if (table === "profile_salespersons") {
    const profile = tables.profiles.find((p) => p.id === row.profile_id);
    return row.profile_id === ctx.userId || (ctx.isAdmin && profile?.tenant_id === ctx.tenantId);
  }
  if (ctx.isVendor) return vendorRowAllowed(tables, ctx, table, row);
  if (!ctx.isAdmin) return false;
  if (TENANT_TABLES.has(table)) return row.user_id === ctx.tenantId;
  if (CHILD_OF_SALE.has(table)) return saleVisible(tables, ctx, row.sale_id);
  // Views: security_invoker (019) + só admin (020).
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
