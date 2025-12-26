drop view if exists sales_with_details;

create view sales_with_details as
select
  s.id,
  s.company_id,
  s.user_id,
  s.salesperson_id,
  s.order_number,
  s.product_name,
  s.customer_name,
  s.sale_date,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.status,
  s.notes,
  s.created_at,
  sp as salesperson,
  jsonb_build_object(
    'id', sp.id,
    'name', sp.name,
    'commission_percentage', sp.commission_percentage
  ) as salesperson_info,
  coalesce(
    jsonb_agg(sc.*) filter (where sc.id is not null),
    '[]'::jsonb
  ) as costs,
  coalesce(sum(sc.amount), 0) as total_costs
from sales s
left join salespersons sp on sp.id = s.salesperson_id
left join sale_costs sc on sc.sale_id = s.id
group by
  s.id,
  s.company_id,
  s.user_id,
  s.salesperson_id,
  s.order_number,
  s.product_name,
  s.customer_name,
  s.sale_date,
  s.quantity,
  s.unit_price,
  s.total_price,
  s.status,
  s.notes,
  s.created_at,
  sp.id;

