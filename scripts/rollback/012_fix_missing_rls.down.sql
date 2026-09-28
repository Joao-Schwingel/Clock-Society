-- Reverte a 012. SÓ para o A-DB-17 (aplica → reverte → reaplica num banco local descartável).
-- Em produção, a 012 NÃO é revertida: ela fecha brechas (planejamento §9).
-- Os grants do anon voltam ao padrão do Supabase; confira com o inventário de grants salvo na
-- baseline da Fase 1 antes de usar em qualquer outro lugar.

begin;

drop policy if exists "sale_items_owner_all" on public.sale_items;
alter table public.sale_items disable row level security;

drop policy if exists "sale_salespersons_owner_all" on public.sale_salespersons;
alter table public.sale_salespersons disable row level security;

alter view public.sales_with_details set (security_invoker = off);
alter view public.sales_with_salespersons set (security_invoker = off);

grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema public to anon;
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;

commit;
