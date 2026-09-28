-- Reverte a 015: restaura EXATAMENTE as políticas de produção salvas na baseline
-- (docs/baseline/pg_policies-producao-2026-09-28.json — 32 políticas, 4 por tabela, em 8 tabelas;
-- nenhuma política em sale_items nem em sale_salespersons).

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

alter table public.companies alter column user_id drop default;
create policy "Users can view their own companies" on public.companies for select using (auth.uid() = user_id);
create policy "Users can insert their own companies" on public.companies for insert with check (auth.uid() = user_id);
create policy "Users can update their own companies" on public.companies for update using (auth.uid() = user_id);
create policy "Users can delete their own companies" on public.companies for delete using (auth.uid() = user_id);
alter table public.inventory alter column user_id drop default;
create policy "Users can view their own inventory" on public.inventory for select using (auth.uid() = user_id);
create policy "Users can insert their own inventory" on public.inventory for insert with check (auth.uid() = user_id);
create policy "Users can update their own inventory" on public.inventory for update using (auth.uid() = user_id);
create policy "Users can delete their own inventory" on public.inventory for delete using (auth.uid() = user_id);
alter table public.sales alter column user_id drop default;
create policy "Users can view their own sales" on public.sales for select using (auth.uid() = user_id);
create policy "Users can insert their own sales" on public.sales for insert with check (auth.uid() = user_id);
create policy "Users can update their own sales" on public.sales for update using (auth.uid() = user_id);
create policy "Users can delete their own sales" on public.sales for delete using (auth.uid() = user_id);
alter table public.costs alter column user_id drop default;
create policy "Users can view their own costs" on public.costs for select using (auth.uid() = user_id);
create policy "Users can insert their own costs" on public.costs for insert with check (auth.uid() = user_id);
create policy "Users can update their own costs" on public.costs for update using (auth.uid() = user_id);
create policy "Users can delete their own costs" on public.costs for delete using (auth.uid() = user_id);
alter table public.contracts alter column user_id drop default;
create policy "Users can view their own contracts" on public.contracts for select using (auth.uid() = user_id);
create policy "Users can insert their own contracts" on public.contracts for insert with check (auth.uid() = user_id);
create policy "Users can update their own contracts" on public.contracts for update using (auth.uid() = user_id);
create policy "Users can delete their own contracts" on public.contracts for delete using (auth.uid() = user_id);
alter table public.sale_costs alter column user_id drop default;
create policy "Users can view their own sale costs" on public.sale_costs for select using (auth.uid() = user_id);
create policy "Users can insert their own sale costs" on public.sale_costs for insert with check (auth.uid() = user_id);
create policy "Users can update their own sale costs" on public.sale_costs for update using (auth.uid() = user_id);
create policy "Users can delete their own sale costs" on public.sale_costs for delete using (auth.uid() = user_id);
alter table public.fixed_costs alter column user_id drop default;
create policy "Users can view their own fixed costs" on public.fixed_costs for select using (auth.uid() = user_id);
create policy "Users can insert their own fixed costs" on public.fixed_costs for insert with check (auth.uid() = user_id);
create policy "Users can update their own fixed costs" on public.fixed_costs for update using (auth.uid() = user_id);
create policy "Users can delete their own fixed costs" on public.fixed_costs for delete using (auth.uid() = user_id);
alter table public.salespersons alter column user_id drop default;
create policy "Users can view their own salespersons" on public.salespersons for select using (auth.uid() = user_id);
create policy "Users can insert their own salespersons" on public.salespersons for insert with check (auth.uid() = user_id);
create policy "Users can update their own salespersons" on public.salespersons for update using (auth.uid() = user_id);
create policy "Users can delete their own salespersons" on public.salespersons for delete using (auth.uid() = user_id);

-- Filhas: na baseline, sale_items e sale_salespersons não têm política nenhuma (RLS desligado);
-- as da 015 já foram removidas no bloco acima.

commit;
