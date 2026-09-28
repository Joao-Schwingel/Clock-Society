-- Reverte a 019: as 6 FKs voltam a ON DELETE CASCADE (estado da baseline de produção).
-- Com isso, apagar o usuário dono volta a apagar todos os dados.

begin;

alter table public.companies    drop constraint if exists companies_user_id_fkey;
alter table public.contracts    drop constraint if exists contracts_user_id_fkey;
alter table public.costs        drop constraint if exists costs_user_id_fkey;
alter table public.inventory    drop constraint if exists inventory_user_id_fkey;
alter table public.sales        drop constraint if exists sales_user_id_fkey;
alter table public.salespersons drop constraint if exists salespersons_user_id_fkey;

alter table public.companies    add constraint companies_user_id_fkey    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.contracts    add constraint contracts_user_id_fkey    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.costs        add constraint costs_user_id_fkey        foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.inventory    add constraint inventory_user_id_fkey    foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.sales        add constraint sales_user_id_fkey        foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.salespersons add constraint salespersons_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

commit;
