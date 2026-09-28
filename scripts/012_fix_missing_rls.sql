-- 012 — Fecha as brechas existentes (planejamento 1.2; Fase 3, fatia 3.1).
-- Pode ir para produção sozinha: não muda nada para o dono dos dados (A-DB-04), só fecha acesso
-- de quem não deveria ter (A-DB-06, A-DB-09).
-- Rollback: scripts/rollback/012_fix_missing_rls.down.sql (só para o A-DB-17; não reverter em produção).
--
-- NUNCA é aplicada por CI nem por agente de IA. Aplicação manual, seguindo o runbook
-- (docs/fase-3/runbook.md).

begin;

-- 1. sale_items: RLS habilitado, acesso derivado da venda-mãe.
--    Nesta fatia ainda vale o modelo antigo (auth.uid() = sales.user_id); a 015 troca pelo
--    modelo de inquilino.
alter table public.sale_items enable row level security;

create policy "sale_items_owner_all" on public.sale_items
  for all to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sales s where s.id = sale_items.sale_id and s.user_id = auth.uid()));
comment on policy "sale_items_owner_all" on public.sale_items is
  'Fase 3.1: itens herdam o acesso da venda-mãe (dono = auth.uid()). Substituída na 015.';

-- 2. sale_salespersons: criada à mão no painel (achado 3). Baseline de produção: RLS desligado e
--    nenhuma política. O bloco abaixo remove qualquer política por garantia e aplica a mesma regra
--    derivada de sales.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'sale_salespersons' loop
    execute format('drop policy %I on public.sale_salespersons', pol.policyname);
  end loop;
end $$;

alter table public.sale_salespersons enable row level security;

create policy "sale_salespersons_owner_all" on public.sale_salespersons
  for all to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sales s where s.id = sale_salespersons.sale_id and s.user_id = auth.uid()));
comment on policy "sale_salespersons_owner_all" on public.sale_salespersons is
  'Fase 3.1: vínculo venda↔vendedor herda o acesso da venda-mãe (dono = auth.uid()). Substituída na 015.';

-- 3. Views passam a respeitar o RLS de quem consulta (§7.4 — rodar A-DB-04 logo depois).
--    Sem isso elas rodam com o dono (postgres) e ignoram o RLS: hoje qualquer um com a chave anon
--    lê todas as vendas por elas (baseline de 28/09/2026, docs/baseline/).
alter view public.sales_with_details set (security_invoker = on);
alter view public.sales_with_salespersons set (security_invoker = on);

-- salesperson_summary existe em produção, não é usada pelo app e hoje agrega comissões de todos
-- os inquilinos (scripts/views/salesperson_summary.sql). Passa a respeitar o RLS.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'salesperson_summary' and c.relkind = 'v') then
    execute 'alter view public.salesperson_summary set (security_invoker = on)';
  end if;
end $$;

-- 4. A chave anônima não lê nada do schema public (A-DB-09). O app só fala com o PostgREST
--    depois do login; o login em si vai para o Auth, não para o PostgREST.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

commit;
