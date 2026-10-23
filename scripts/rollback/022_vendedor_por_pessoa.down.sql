-- Rollback da 022: volta ao modelo de um cadastro por (pessoa, empresa).
--
-- Reconstrói a partir de `salespersons_merge_map`, que a 022 gravou. O repontamento das vendas é
-- determinístico porque a venda sabe a empresa: cada linha de `sale_salespersons` volta para o
-- cadastro legado daquela empresa.
--
-- Perde-se: acessos criados DEPOIS da 022 para empresas que não existiam no mapa (viram cadastro
-- novo, sem histórico), e o `commission_percentage`, que volta com o valor que tinha na fusão —
-- nenhum cálculo o usa. A conferência do A-DB-04 (contagens e somas por empresa) tem que bater
-- antes e depois.

begin;

-- ------------------------------------------------------- 1. colunas do modelo antigo de volta
alter table public.salespersons add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.salespersons add column if not exists commission_percentage numeric(5,2) not null default 0;

-- O cadastro que sobreviveu volta para a SUA empresa: entre os acessos dele, o único que NÃO está
-- no mapa de fusão — o mapa guarda a empresa de cada cadastro que foi apagado, então o que sobra é
-- o dele.
--
-- Não serve pegar "o acesso mais antigo": a 022 insere todos os acessos no mesmo comando, com o
-- mesmo `created_at`, e o desempate por `company_id` (uuid) é arbitrário. Nos dados de produção isso
-- devolvia 5 dos 7 sobreviventes para a empresa de um duplicado, criando dois cadastros do mesmo
-- nome na mesma empresa e 397 vendas com vendedor de outra empresa (o que ainda faria a guarda (b)
-- da 022 abortar numa segunda aplicação). Medido no ensaio com o clone de produção, 23/10/2026.
update public.salespersons sp
   set company_id = v.company_id
  from (
    select distinct on (sc.salesperson_id) sc.salesperson_id, sc.company_id
      from public.salesperson_companies sc
     order by sc.salesperson_id,
              -- false (não está no mapa) vem primeiro
              exists (select 1 from public.salespersons_merge_map m
                       where m.kept_id = sc.salesperson_id and m.legacy_company_id = sc.company_id),
              sc.created_at, sc.company_id
  ) v
 where sp.id = v.salesperson_id and sp.company_id is null;

-- ------------------------------------------------- 2. recriar os cadastros que foram fundidos
insert into public.salespersons (id, user_id, company_id, name, commission_percentage, is_active)
select m.legacy_id, sp.user_id, m.legacy_company_id, m.name,
       coalesce(m.legacy_commission_percentage, 0), coalesce(m.legacy_is_active, true)
  from public.salespersons_merge_map m
  join public.salespersons sp on sp.id = m.kept_id
on conflict (id) do nothing;

-- ------------------------------------- 3. devolver cada venda ao cadastro daquela empresa
update public.sale_salespersons ss
   set salesperson_id = m.legacy_id
  from public.sales s, public.salespersons_merge_map m
 where s.id = ss.sale_id
   and m.kept_id = ss.salesperson_id
   and m.legacy_company_id = s.company_id;

-- ------------------------------------------------------------- 4. vínculo de login antigo
create table if not exists public.profile_salespersons (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  salesperson_id uuid not null references public.salespersons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, salesperson_id),
  unique (salesperson_id)
);

insert into public.profile_salespersons (profile_id, salesperson_id)
select sp.profile_id, sp.id from public.salespersons sp where sp.profile_id is not null
on conflict do nothing;

alter table public.profile_salespersons enable row level security;
revoke all on public.profile_salespersons from anon, authenticated;
grant select on public.profile_salespersons to authenticated;

create policy "profile_salespersons_select" on public.profile_salespersons
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (public.is_admin() and exists (
      select 1 from public.profiles p
       where p.id = profile_salespersons.profile_id and p.tenant_id = public.current_tenant_id()
    ))
  );

-- --------------------------------------------------------------- 5. funções como estavam
create or replace function public.my_salesperson_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select ps.salesperson_id
  from public.profile_salespersons ps
  join public.profiles p on p.id = ps.profile_id
  where ps.profile_id = auth.uid() and p.is_active and p.role = 'vendedor'
$$;

create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct sp.company_id
  from public.salespersons sp
  where sp.id in (select public.my_salesperson_ids())
$$;

create or replace function public.create_site_salesperson()
returns trigger
language plpgsql
as $$
begin
  insert into salespersons (user_id, company_id, name, commission_percentage, is_active)
  values (new.user_id, new.id, 'Site', 0, true);
  return new;
end;
$$;

-- ---------------------------------- 5b. commission_summary() como estava na 016
-- Aqui, e não "reaplique a 016": a 016 usa `create view` para vendor_sales e falharia na
-- segunda passada. O corpo é o mesmo; muda só o filtro de empresa, que volta a salespersons.company_id.
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
as $fn$
begin
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
    case
      when public.is_admin() or sp.id in (select public.my_salesperson_ids()) then coalesce(p.total_commission, 0)
      else null
    end
  from public.salespersons sp
    left join per_salesperson p on p.salesperson_id = sp.id
  where ((sp.company_id = p_company_id and sp.is_active) or p.salesperson_id is not null)
    and (public.is_admin() or sp.is_active)
  order by sp.name;
end;
$fn$;

-- ------------------------------------------------------------- 6. estruturas da 022 saem
alter table public.salespersons drop column if exists profile_id;
drop table if exists public.salesperson_companies;
drop table if exists public.salespersons_merge_map;

-- Só volta a ser NOT NULL se ninguém tiver ficado sem empresa. Uma pessoa cadastrada depois da
-- 022 e sem nenhum acesso não tem company_id para onde voltar: nesse caso a coluna fica nullable
-- e o aviso abaixo diz quem são, para resolver à mão.
do $$
declare n int;
begin
  select count(*) into n from public.salespersons where company_id is null;
  if n = 0 then
    alter table public.salespersons alter column company_id set not null;
  else
    raise notice 'company_id segue nullable: % pessoa(s) sem nenhuma empresa. Verifique: '
      'select id, name from public.salespersons where company_id is null;', n;
  end if;
end $$;

commit;
