drop view if exists sales_with_details;

create view sales_with_details as
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

  -- vendedores (isolado)
  coalesce(sp_data.salespersons, '[]'::jsonb) as salespersons,

  -- custos (isolado)
  coalesce(sc_data.costs, '[]'::jsonb) as costs,
  coalesce(sc_data.total_costs, 0) as total_costs,

  -- valor faltante (0 se já pago) — usado para filtro server-side
  case
    when s.payment_status = 'pago' then 0::numeric
    else greatest(0, s.total_price - coalesce(s.entry_value, 0))
  end as remaining_amount,

  -- nomes de todos os itens da venda (para busca server-side)
  coalesce(
    (
      select string_agg(si.product_name, ', ' order by si.created_at)
      from sale_items si
      where si.sale_id = s.id
    ),
    s.product_name,
    ''
  ) as sale_item_names

from sales s

-- vendedores
left join (
  select
    ssp.sale_id,
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'name', sp.name,
        'commission_percent', ssp.commission_percent
      )
    ) as salespersons
  from sale_salespersons ssp
  join salespersons sp on sp.id = ssp.salesperson_id
  group by ssp.sale_id
) sp_data on sp_data.sale_id = s.id

-- custos
left join (
  select
    sc.sale_id,
    jsonb_agg(sc.*) as costs,
    sum(sc.amount) as total_costs
  from sale_costs sc
  group by sc.sale_id
) sc_data on sc_data.sale_id = s.id;
