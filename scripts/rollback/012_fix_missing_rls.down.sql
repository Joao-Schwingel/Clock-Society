-- Reverte a 012. SÓ para o A-DB-17 (aplica → reverte → reaplica num banco local descartável).
-- Em produção, a 012 NÃO é revertida: ela fecha brechas (planejamento §9).
-- Volta ao estado exato da baseline de produção (docs/baseline/, 28/09/2026): RLS desligado em
-- sale_items e sale_salespersons, sem políticas nelas, views sem security_invoker e o anon com
-- todos os privilégios em todas as tabelas e views — ou seja, reabre o vazamento.

begin;

drop policy if exists "sale_items_owner_all" on public.sale_items;
alter table public.sale_items disable row level security;

drop policy if exists "sale_salespersons_owner_all" on public.sale_salespersons;
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

commit;
