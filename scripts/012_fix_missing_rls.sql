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

-- 5. O authenticated não precisa de TRUNCATE, TRIGGER nem REFERENCES. TRUNCATE ignora o RLS; a API
--    não o expõe, mas não há por que manter (item 9 da revisão de 28/09/2026).
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- 6. Objetos de produção que o app não usa (item 3 da revisão): ficam no banco, mas ninguém além
--    do dono os executa. Rodando com as permissões de quem chama, dariam números errados sem erro
--    (planejamento §7.1): um vendedor veria a própria comissão sem custos, ou seja, inflada.
--    create_sale também está quebrada (usa bigint onde os ids são uuid).
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
