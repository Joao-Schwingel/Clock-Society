-- salesperson_summary — existe em produção, criada à mão no painel, e NÃO é usada pelo app.
-- Definição de produção (pg_get_viewdef em 28/09/2026, docs/baseline/), versionada só como registro.

drop view if exists public.salesperson_summary;

create view public.salesperson_summary as
with sale_costs_sum as (
  select sale_costs.sale_id, sum(sale_costs.amount) as total_cost
  from sale_costs
  group by sale_costs.sale_id
)
select
  sp.id as salesperson_id,
  sp.name,
  count(distinct s.id) as sales_count,
  sum(s.total_price) as total_sales,
  sum(coalesce(sc.total_cost, 0::numeric)) as total_costs,
  sum(s.total_price - coalesce(sc.total_cost, 0::numeric)) as net_profit,
  sum((s.total_price - coalesce(sc.total_cost, 0::numeric)) * (ssp.commission_percent / 100::numeric)) as total_commission
from sale_salespersons ssp
  join sales s on s.id = ssp.sale_id and s.status = 'concluída'::text and s.payment_status = 'pago'::text
  join salespersons sp on sp.id = ssp.salesperson_id
  left join sale_costs_sum sc on sc.sale_id = s.id
group by sp.id, sp.name;
