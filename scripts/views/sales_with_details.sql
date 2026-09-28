-- sales_with_details — definição de PRODUÇÃO (pg_get_viewdef em 28/09/2026, docs/baseline/),
-- acrescida só de security_invoker (Fase 3.1, 012).
--
-- A versão anterior deste arquivo tinha duas colunas a mais (remaining_amount e sale_item_names,
-- do commit 0e84158) que nunca chegaram a produção e que nenhum código do app usa. Foram removidas
-- para o arquivo voltar a ser a fonte de verdade do que está implantado.

drop view if exists public.sales_with_details;

create view public.sales_with_details with (security_invoker = on) as
select
  s.id,
  s.company_id,
  s.user_id,
  s.order_number,
  s.product_name,
  s.customer_name,
  s.sale_date,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.entry_value,
  s.status,
  s.payment_status,
  s.notes,
  s.created_at,
  coalesce(sp_data.salespersons, '[]'::jsonb) as salespersons,
  coalesce(sc_data.costs, '[]'::jsonb) as costs,
  coalesce(sc_data.total_costs, 0::numeric) as total_costs
from sales s
  left join (
    select
      ssp.sale_id,
      jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent)) as salespersons
    from sale_salespersons ssp
      join salespersons sp on sp.id = ssp.salesperson_id
    group by ssp.sale_id
  ) sp_data on sp_data.sale_id = s.id
  left join (
    select
      sc.sale_id,
      jsonb_agg(sc.*) as costs,
      sum(sc.amount) as total_costs
    from sale_costs sc
    group by sc.sale_id
  ) sc_data on sc_data.sale_id = s.id;
