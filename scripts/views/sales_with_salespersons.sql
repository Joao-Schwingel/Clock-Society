-- sales_with_salespersons — usada pelo Dashboard (dashboard-view.tsx). Criada à mão no painel e
-- nunca versionada (achado 4). Definição tirada de produção em 28/09/2026 com
-- pg_get_viewdef (docs/baseline/), acrescida só de security_invoker (Fase 3.1, 012).

drop view if exists public.sales_with_salespersons;

create view public.sales_with_salespersons with (security_invoker = on) as
select
  s.id,
  s.company_id,
  s.product_name,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.sale_date,
  s.customer_name,
  s.notes,
  s.user_id,
  s.created_at,
  s.salesperson,
  s.status,
  s.salesperson_id,
  s.order_number,
  s.entry_value,
  s.payment_status,
  jsonb_agg(
    jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent)
  ) filter (where sp.id is not null) as salespersons
from sales s
  left join sale_salespersons ssp on ssp.sale_id = s.id
  left join salespersons sp on sp.id = ssp.salesperson_id
group by s.id;
