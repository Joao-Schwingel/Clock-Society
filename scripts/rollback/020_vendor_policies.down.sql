-- Reverte a 020: volta ao estado deixado pela 019 (só o admin funcional, como na Fase 3).
-- Antes: reverter a 016 (vendor_sales e commission_summary usam as funções daqui).

begin;

-- 6. Views sem o filtro de admin (estado da 019: security_invoker, definição de produção)
create or replace view public.sales_with_details with (security_invoker = on) as
select
  s.id, s.company_id, s.user_id, s.order_number, s.product_name, s.customer_name, s.sale_date,
  s.quantity, s.unit_price, s.total_price, s.entry_value, s.status, s.payment_status, s.notes,
  s.created_at,
  coalesce(sp_data.salespersons, '[]'::jsonb) as salespersons,
  coalesce(sc_data.costs, '[]'::jsonb) as costs,
  coalesce(sc_data.total_costs, 0::numeric) as total_costs
from public.sales s
  left join (
    select ssp.sale_id,
      jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent)) as salespersons
    from public.sale_salespersons ssp join public.salespersons sp on sp.id = ssp.salesperson_id
    group by ssp.sale_id
  ) sp_data on sp_data.sale_id = s.id
  left join (
    select sc.sale_id, jsonb_agg(sc.*) as costs, sum(sc.amount) as total_costs
    from public.sale_costs sc group by sc.sale_id
  ) sc_data on sc_data.sale_id = s.id;

create or replace view public.sales_with_salespersons with (security_invoker = on) as
select
  s.id, s.company_id, s.product_name, s.quantity, s.unit_price, s.total_price, s.sale_date,
  s.customer_name, s.notes, s.user_id, s.created_at, s.salesperson, s.status, s.salesperson_id,
  s.order_number, s.entry_value, s.payment_status,
  jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'commission_percent', ssp.commission_percent))
    filter (where sp.id is not null) as salespersons
from public.sales s
  left join public.sale_salespersons ssp on ssp.sale_id = s.id
  left join public.salespersons sp on sp.id = ssp.salesperson_id
group by s.id;

-- 5. Políticas do vendedor
drop policy if exists "companies_vendor_select" on public.companies;
drop policy if exists "sales_vendor_select" on public.sales;
drop policy if exists "sale_items_vendor_select" on public.sale_items;
drop policy if exists "sale_salespersons_vendor_select" on public.sale_salespersons;
drop policy if exists "salespersons_vendor_select" on public.salespersons;
drop policy if exists "inventory_vendor_select" on public.inventory;
drop policy if exists "sale_costs_vendor_select" on public.sale_costs;

-- 4. Hook como na 014 (sem must_change_password)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  prof record;
begin
  select p.role, p.tenant_id, p.is_active into prof
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid;

  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  if found and prof.is_active then
    claims := jsonb_set(claims, '{app_metadata,app_role}', to_jsonb(prof.role));
    claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(prof.tenant_id::text));
  else
    claims := claims #- '{app_metadata,app_role}' #- '{app_metadata,tenant_id}';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- 3. Funções auxiliares como na 014
drop function if exists public.vendor_can_see_sale(uuid);
drop function if exists public.my_company_ids();
drop function if exists public.my_salesperson_ids();
drop function if exists public.is_vendor();

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    (select p.tenant_id from public.profiles p where p.id = auth.uid() and p.is_active)
  )
$$;

create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'app_role', ''),
    (select p.role from public.profiles p where p.id = auth.uid() and p.is_active)
  )
$$;

-- 2. Restrição do admin sempre ativo
alter table public.profiles drop constraint if exists profiles_admin_always_active;

-- 1. Catálogo
delete from public.role_permissions
where (role = 'admin' and permission = 'users.manage')
   or (role = 'vendedor' and permission in ('commissions.view', 'sales.view', 'inventory.view'));

commit;
