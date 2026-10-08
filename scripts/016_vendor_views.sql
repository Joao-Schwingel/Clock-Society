-- 016 — vendor_sales e commission_summary() (planejamento 1.5 e §4.4; Fase 6, fatia 6.3).
-- Rollback: scripts/rollback/016_vendor_views.down.sql
-- NUNCA aplicada por CI nem por agente de IA. Pré-requisitos: 019 e 020 (usa is_vendor(),
-- my_salesperson_ids(), my_company_ids()). Verificação: checklist MANUAL V-DB-09 a 12.
--
-- NÃO aplicar em produção antes de a issue #13 (Q2/Q10) ser respondida: depois de publicada,
-- mudar a regra exige migration nova e muda os números do admin.

begin;

-- 1. Vendas do vendedor. security_invoker: o RLS de sales (020) filtra — o vendedor vê só as vendas
--    em que consta; o admin vê as do inquilino. Nenhuma coluna de custo, margem ou líquido.
--    my_commission_percent: o percentual do PRÓPRIO vendedor na venda (decisão 3.1, padrão da #13);
--    nunca o do colega (V-DB-17). Para o admin vem nulo.
create view public.vendor_sales with (security_invoker = on) as
select
  s.id,
  s.company_id,
  s.order_number,
  s.product_name,
  s.customer_name,
  s.sale_date,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.status,
  s.payment_status,
  s.entry_value,
  s.notes,
  s.created_at,
  (
    select ss.commission_percent
    from public.sale_salespersons ss
    where ss.sale_id = s.id
      and ss.salesperson_id in (select public.my_salesperson_ids())
    limit 1
  ) as my_commission_percent
from public.sales s;

grant select on public.vendor_sales to authenticated;
revoke all on public.vendor_sales from anon;

-- 2. Resumo de comissões por vendedor — IDÊNTICO para admin e vendedor (V-DB-10, V-UI-06).
--    security definer: agrega vendas e custos de todos os vendedores, que o vendedor não alcança
--    linha a linha (§7.1). Por isso verifica o acesso aqui dentro e devolve SÓ totais por vendedor
--    — nunca acrescentar coluna por venda.
--
--    Regras = comportamento atual do Dashboard (padrões da #13; conferidas contra o oráculo da
--    Fase 1 em lib/calc/commission-summary-oracle.test.ts, pela emulação do mock):
--    - Q2: venda compartilhada conta com o valor cheio para cada vendedor (achado 9);
--    - Q10a: só vendas concluídas;
--    - Q10b / N12: vendedor inativo com vendas aparece (is_active = false) e entra no total;
--      vendedor ativo sem vendas aparece zerado (cartão "Sem comissão no período");
--    - N13: sem arredondamento (a tela formata);
--    - p_months nulo: nenhum filtro de data — todos os anos, como o Dashboard sem mês marcado
--      (bug conhecido, mantido até a #13). p_months em 1..12; o front converte de 0..11.
create or replace function public.commission_summary(
  p_company_id uuid,
  p_year int,
  p_months int[] default null
)
returns table (
  salesperson_id uuid,
  salesperson_name text,
  is_active boolean,
  sales_count bigint,
  total_sales numeric,
  total_costs numeric,
  net_profit numeric,
  total_commission numeric
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- guarda: admin do inquilino, ou vendedor vinculado a esta empresa
  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.user_id = public.current_tenant_id()
      and (public.is_admin() or (public.is_vendor() and c.id in (select public.my_company_ids())))
  ) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  return query
  with sale_totals as (
    select
      s.id,
      s.total_price,
      coalesce((select sum(sc.amount) from public.sale_costs sc where sc.sale_id = s.id), 0) as costs
    from public.sales s
    where s.company_id = p_company_id
      and s.status = 'concluída'
      and (
        p_months is null
        or (extract(year from s.sale_date)::int = p_year and extract(month from s.sale_date)::int = any (p_months))
      )
  ),
  per_salesperson as (
    select
      ss.salesperson_id,
      count(*) as sales_count,
      sum(st.total_price) as total_sales,
      sum(st.costs) as total_costs,
      sum(st.total_price - st.costs) as net_profit,
      sum((st.total_price - st.costs) * ss.commission_percent / 100) as total_commission
    from public.sale_salespersons ss
      join sale_totals st on st.id = ss.sale_id
    group by ss.salesperson_id
  )
  select
    sp.id,
    sp.name,
    sp.is_active,
    coalesce(p.sales_count, 0)::bigint,
    coalesce(p.total_sales, 0),
    coalesce(p.total_costs, 0),
    coalesce(p.net_profit, 0),
    coalesce(p.total_commission, 0)
  from public.salespersons sp
    left join per_salesperson p on p.salesperson_id = sp.id
  where (sp.company_id = p_company_id and sp.is_active)
     or p.salesperson_id is not null
  order by sp.name;
end;
$$;

revoke execute on function public.commission_summary(uuid, int, int[]) from public, anon;
grant execute on function public.commission_summary(uuid, int, int[]) to authenticated;

commit;
