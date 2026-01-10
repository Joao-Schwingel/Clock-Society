create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_name text not null,
  quantity integer not null,
  unit_price numeric not null,
  total_price numeric generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);

create or replace function public.recalc_sale_total()
returns trigger language plpgsql as $$
begin
  update public.sales s
  set total_price = coalesce((
    select sum(si.total_price) from public.sale_items si where si.sale_id = s.id
  ), 0)
  where s.id = coalesce(new.sale_id, old.sale_id);
  return null;
end;
$$;

drop trigger if exists sale_items_recalc_total_ins on public.sale_items;
drop trigger if exists sale_items_recalc_total_upd on public.sale_items;
drop trigger if exists sale_items_recalc_total_del on public.sale_items;

create trigger sale_items_recalc_total_ins
after insert on public.sale_items
for each row execute function public.recalc_sale_total();

create trigger sale_items_recalc_total_upd
after update of quantity, unit_price, sale_id on public.sale_items
for each row execute function public.recalc_sale_total();

create trigger sale_items_recalc_total_del
after delete on public.sale_items
for each row execute function public.recalc_sale_total();

insert into public.sale_items (sale_id, product_name, quantity, unit_price)
select s.id, s.product_name, s.quantity, s.unit_price
from public.sales s
where not exists (
  select 1 from public.sale_items si where si.sale_id = s.id
);

