-- Reverte a 015: volta ao modelo "dono = auth.uid()" dos scripts 001–010 e da 012.
--
-- ATENÇÃO: produção pode ter políticas criadas à mão no painel que não estão nos scripts. A fonte
-- de verdade do rollback é o `select * from pg_policies where schemaname = 'public'` salvo na
-- baseline da Fase 1 — compare com este arquivo antes de usá-lo fora de um banco local.

begin;

do $$
declare pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('companies', 'sales', 'sale_items', 'sale_costs', 'sale_salespersons',
                        'salespersons', 'inventory', 'costs', 'fixed_costs', 'contracts')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies', 'sales', 'sale_costs', 'salespersons', 'inventory',
                           'costs', 'fixed_costs', 'contracts']
  loop
    execute format('alter table public.%I alter column user_id drop default', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || '_owner_select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id)', t || '_owner_update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || '_owner_delete', t);
  end loop;
end $$;

-- Filhas: mesmo estado deixado pela 012.
create policy "sale_items_owner_all" on public.sale_items
  for all to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()));

create policy "sale_salespersons_owner_all" on public.sale_salespersons
  for all to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = auth.uid()));

commit;
