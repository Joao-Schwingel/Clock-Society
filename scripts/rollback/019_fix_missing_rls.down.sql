-- Reverte a 019: volta ao estado da baseline de produção (docs/baseline/, 28/09/2026) — RLS
-- desligado em sale_items e sale_salespersons, views sem security_invoker, anon com tudo.
-- REABRE O VAZAMENTO (#9): só para o ensaio (A-DB-17) ou como último recurso.
-- Antes: reverter a 020 (as políticas do vendedor dependem destas tabelas com RLS).

begin;

alter table public.sale_items disable row level security;
alter table public.sale_salespersons disable row level security;

alter view public.sales_with_details set (security_invoker = off);
alter view public.sales_with_salespersons set (security_invoker = off);
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'salesperson_summary' and c.relkind = 'v') then
    execute 'alter view public.salesperson_summary set (security_invoker = off)';
  end if;
end $$;

grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema public to anon;
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;

grant truncate, trigger, references on all tables in schema public to authenticated;
alter default privileges in schema public grant truncate, trigger, references on tables to authenticated;

do $$
begin
  if to_regprocedure('public.create_sale(jsonb, jsonb, jsonb)') is not null then
    grant execute on function public.create_sale(jsonb, jsonb, jsonb) to public, anon, authenticated;
  end if;
  if to_regprocedure('public.salesperson_summary_by_months(integer, integer[])') is not null then
    grant execute on function public.salesperson_summary_by_months(integer, integer[]) to public, anon, authenticated;
  end if;
  if to_regclass('public.salesperson_summary') is not null then
    grant all on public.salesperson_summary to anon, authenticated;
  end if;
end $$;

commit;
