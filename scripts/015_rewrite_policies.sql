-- 015 — Políticas "admin do inquilino" nas 10 tabelas (planejamento 1.4, só o ramo do admin —
-- D-6; Fase 3, fatia 3.3). PONTO DE NÃO RETORNO: a partir daqui o banco depende de profiles.
-- Vai para produção na MESMA janela que a 017 e a 018 (sem a 018, o admin não tem perfil e não
-- vê nada).
-- Rollback: scripts/rollback/015_rewrite_policies.down.sql
-- NUNCA aplicada por CI nem por agente de IA — ver docs/fase-3/runbook.md.
--
-- user_id passa a significar o INQUILINO (planejamento §3.1). Decisão 3.6 da Fase 2: o default
-- da coluna é o inquilino de quem insere, e o front deixa de enviar user_id (N3).

begin;

-- 1. Remove todas as políticas atuais das 10 tabelas (inclusive as criadas à mão no painel, que
--    não estão nos scripts). A linha de base para o rollback é o pg_policies salvo na Fase 1.
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

-- 2. Tabelas com user_id: uma política "for all" — admin do inquilino lê e escreve; ninguém
--    mais. O ramo do vendedor (select) entra na Fase 6 como política permissiva adicional.
do $$
declare t text;
begin
  foreach t in array array['companies', 'sales', 'sale_costs', 'salespersons', 'inventory',
                           'costs', 'fixed_costs', 'contracts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I alter column user_id set default public.current_tenant_id()', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = public.current_tenant_id() and public.is_admin())
         with check (user_id = public.current_tenant_id() and public.is_admin())',
      t || '_tenant_admin_all', t);
    execute format(
      'comment on policy %I on public.%I is %L',
      t || '_tenant_admin_all', t,
      'Fase 3: só o admin do inquilino (user_id = inquilino) lê e escreve. Nega por padrão: '
      || 'sem perfil, outro inquilino ou outro papel → 0 linhas e escrita recusada.');
  end loop;
end $$;

-- 3. Tabelas filhas sem user_id: herdam da venda-mãe.
create policy "sale_items_tenant_admin_all" on public.sale_items
  for all to authenticated
  using (public.is_admin() and exists (
    select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = public.current_tenant_id()))
  with check (public.is_admin() and exists (
    select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = public.current_tenant_id()));
comment on policy "sale_items_tenant_admin_all" on public.sale_items is
  'Fase 3: itens herdam da venda-mãe; só o admin do inquilino da venda lê e escreve.';

create policy "sale_salespersons_tenant_admin_all" on public.sale_salespersons
  for all to authenticated
  using (public.is_admin() and exists (
    select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = public.current_tenant_id()))
  with check (public.is_admin() and exists (
    select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = public.current_tenant_id()));
comment on policy "sale_salespersons_tenant_admin_all" on public.sale_salespersons is
  'Fase 3: vínculo venda↔vendedor herda da venda-mãe; só o admin do inquilino lê e escreve.';

commit;
