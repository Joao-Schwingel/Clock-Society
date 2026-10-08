-- 019 — Fecha as brechas do banco (issue #9; planejamento 1.2; Fase 6, fatia 6.2).
-- Pré-requisito do papel vendedor: sem isto, o vendedor leria todas as vendas pelas views e pelas
-- tabelas filhas. Para o admin não muda nada (as políticas da 015 já o cobrem — A-DB-04).
-- Rollback: scripts/rollback/019_fix_missing_rls.down.sql (reabre o vazamento: só para o ensaio).
-- NUNCA aplicada por CI nem por agente de IA — aplicação manual, no runbook da Fase 6.

begin;

-- 1. sale_items e sale_salespersons: RLS ligado. As políticas "*_tenant_admin_all" já existem (015)
--    e passam a valer; as do vendedor entram na 020. Baseline: RLS desligado, nenhuma política.
alter table public.sale_items enable row level security;
alter table public.sale_salespersons enable row level security;

-- 2. Views respeitam o RLS de quem consulta (§7.4 — rodar A-DB-04 logo depois). Sem isso rodam com o
--    dono (postgres) e ignoram o RLS: hoje qualquer um com a chave anon lê todas as vendas por elas.
alter view public.sales_with_details set (security_invoker = on);
alter view public.sales_with_salespersons set (security_invoker = on);
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'salesperson_summary' and c.relkind = 'v') then
    execute 'alter view public.salesperson_summary set (security_invoker = on)';
  end if;
end $$;

-- 3. A chave anônima não lê nada do schema public. O app só fala com o PostgREST depois do login.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 4. O authenticated não precisa de TRUNCATE, TRIGGER nem REFERENCES (TRUNCATE ignora o RLS).
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- 5. Objetos de produção que o app não usa: ficam no banco, mas só o dono os executa. Rodando com
--    as permissões de quem chama, dariam ao vendedor a própria comissão sem custos (inflada, §7.1).
do $$
begin
  if to_regprocedure('public.create_sale(jsonb, jsonb, jsonb)') is not null then
    revoke execute on function public.create_sale(jsonb, jsonb, jsonb) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.salesperson_summary_by_months(integer, integer[])') is not null then
    revoke execute on function public.salesperson_summary_by_months(integer, integer[]) from public, anon, authenticated;
  end if;
  if to_regclass('public.salesperson_summary') is not null then
    revoke all on public.salesperson_summary from anon, authenticated;
  end if;
end $$;

commit;
