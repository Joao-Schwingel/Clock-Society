-- 022 — Vendedor vira PESSOA com acesso a N empresas; login 1:1 com a pessoa.
-- Rollback: scripts/rollback/022_vendedor_por_pessoa.down.sql
-- NUNCA aplicada por CI nem por agente de IA — aplicação manual.
-- Proposta e análise de risco: docs/fase-6/vinculo-login-vendedor.md.
--
-- Antes: um registro em `salespersons` por (pessoa, empresa). A mesma pessoa atendendo três
-- empresas eram três cadastros com o mesmo nome, e o login precisava apontar para os três
-- (tabela de junção `profile_salespersons`).
--
-- Depois: um registro por PESSOA, com os acessos em `salesperson_companies`, e o login numa
-- coluna `profile_id` — 1:1, garantido por índice único.
--
-- Por que é seguro para o histórico (medido nos dados de produção em 11/10/2026):
--   * a comissão mora em `sale_salespersons.commission_percent`, que NÃO muda de forma. O
--     `salespersons.commission_percentage` não é lido por nenhum cálculo (resquício do modelo
--     antigo): 188 de 754 linhas já divergiam dele;
--   * nenhuma venda tem dois registros da mesma pessoa, então repontar não colide;
--   * nenhum vínculo venda↔vendedor atravessa empresas, então os acessos saem exatos dos
--     cadastros atuais.
-- As três condições são verificadas aqui como GUARDAS: se alguma não valer no banco em que esta
-- migration rodar, ela aborta sem deixar nada pela metade.
--
-- A fusão usa (inquilino + nome normalizado). Nomes iguais viram a mesma pessoa — confira a lista
-- antes de aplicar:
--   select user_id, lower(btrim(name)) as nome, count(*), string_agg(company_id::text, ', ')
--     from public.salespersons group by 1, 2 having count(*) > 1;

begin;

-- ---------------------------------------------------------------- 1. estruturas novas
create table if not exists public.salesperson_companies (
  salesperson_id uuid not null references public.salespersons(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (salesperson_id, company_id)
);

comment on table public.salesperson_companies is
  'Em quais empresas a pessoa atende (022). Substitui salespersons.company_id: o cadastro passou a '
  'ser da pessoa, e o acesso por empresa vive aqui.';

-- Mapa da fusão: auditoria e insumo do rollback. Sem ele a 022 seria irreversível.
create table if not exists public.salespersons_merge_map (
  legacy_id uuid primary key,
  kept_id uuid not null references public.salespersons(id) on delete cascade,
  legacy_company_id uuid not null,
  legacy_commission_percentage numeric(5,2),
  legacy_is_active boolean,
  name text not null,
  merged_at timestamptz not null default now()
);

-- -------------------------------------------------- 2. acessos a partir do que existe hoje
insert into public.salesperson_companies (salesperson_id, company_id, is_active)
select sp.id, sp.company_id, sp.is_active
  from public.salespersons sp
on conflict (salesperson_id, company_id) do nothing;

-- ------------------------------------------- 3. quem sobrevive: o cadastro mais antigo do nome
create temporary table _fusao on commit drop as
with ordenado as (
  select
    sp.id, sp.user_id, sp.company_id, sp.name, sp.commission_percentage, sp.is_active,
    first_value(sp.id) over (
      partition by sp.user_id, lower(btrim(sp.name))
      order by sp.created_at nulls last, sp.id
    ) as kept_id
  from public.salespersons sp
)
select * from ordenado where id <> kept_id;

-- --------------------------------------------------------------------------- 4. guardas
do $$
declare n int;
begin
  -- (a) a mesma venda não pode ter dois cadastros que viram a mesma pessoa
  select count(*) into n
    from public.sale_salespersons a
    join public.sale_salespersons b on b.sale_id = a.sale_id and b.id <> a.id
    join _fusao fa on fa.id = a.salesperson_id
   where coalesce((select kept_id from _fusao where id = b.salesperson_id), b.salesperson_id) = fa.kept_id;
  if n > 0 then
    raise exception 'Fusão abortada: % par(es) de vendedores da mesma pessoa na mesma venda. '
      'Resolva as duplicidades antes de aplicar a 022.', n;
  end if;

  -- (b) nenhum vínculo venda↔vendedor pode atravessar empresas
  select count(*) into n
    from public.sale_salespersons ss
    join public.sales s on s.id = ss.sale_id
    join public.salespersons sp on sp.id = ss.salesperson_id
   where s.company_id <> sp.company_id;
  if n > 0 then
    raise exception 'Fusão abortada: % venda(s) com vendedor de outra empresa.', n;
  end if;

  -- (c) um login não pode acabar apontando para duas pessoas distintas
  select count(*) into n from (
    select ps.profile_id
      from public.profile_salespersons ps
      left join _fusao f on f.id = ps.salesperson_id
     group by ps.profile_id
    having count(distinct coalesce(f.kept_id, ps.salesperson_id)) > 1
  ) t;
  if n > 0 then
    raise exception 'Fusão abortada: % login(s) vinculados a pessoas diferentes. '
      'O modelo novo é 1:1 — desfaça esses vínculos antes.', n;
  end if;
end $$;

-- ------------------------------------------------- 5. mover acessos para quem sobreviveu
insert into public.salesperson_companies (salesperson_id, company_id, is_active)
select f.kept_id, sc.company_id, sc.is_active
  from _fusao f
  join public.salesperson_companies sc on sc.salesperson_id = f.id
on conflict (salesperson_id, company_id) do nothing;

-- ------------------------------------------------- 6. repontar o histórico de vendas
update public.sale_salespersons ss
   set salesperson_id = f.kept_id
  from _fusao f
 where ss.salesperson_id = f.id;

-- ------------------------------------------------------------- 7. login 1:1 com a pessoa
alter table public.salespersons
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists salespersons_profile_id_key
  on public.salespersons (profile_id) where profile_id is not null;

comment on column public.salespersons.profile_id is
  'Login desta pessoa (022). Único: uma pessoa, um login. Substitui profile_salespersons.';

update public.salespersons sp
   set profile_id = v.profile_id
  from (
    select distinct ps.profile_id, coalesce(f.kept_id, ps.salesperson_id) as salesperson_id
      from public.profile_salespersons ps
      left join _fusao f on f.id = ps.salesperson_id
  ) v
 where sp.id = v.salesperson_id;

-- ------------------------------------- 8. guardar o que foi fundido e remover os duplicados
insert into public.salespersons_merge_map
  (legacy_id, kept_id, legacy_company_id, legacy_commission_percentage, legacy_is_active, name)
select f.id, f.kept_id, f.company_id, f.commission_percentage, f.is_active, f.name
  from _fusao f
on conflict (legacy_id) do nothing;

delete from public.salespersons where id in (select id from _fusao);

-- ----------------------------------- 9. o cadastro não é mais de uma empresa, nem tem %
alter table public.salespersons drop column if exists company_id;
alter table public.salespersons drop column if exists commission_percentage;

drop table if exists public.profile_salespersons;

create index if not exists idx_salesperson_companies_company
  on public.salesperson_companies (company_id);
create index if not exists idx_salesperson_companies_salesperson
  on public.salesperson_companies (salesperson_id);

-- --------------------------------------------------------- 10. RLS da tabela de acessos
alter table public.salesperson_companies enable row level security;

create policy "salesperson_companies_tenant_admin_all" on public.salesperson_companies
  for all to authenticated
  using (
    exists (select 1 from public.salespersons sp
             where sp.id = salesperson_id and sp.user_id = public.current_tenant_id())
    and public.is_admin()
  )
  with check (
    exists (select 1 from public.salespersons sp
             where sp.id = salesperson_id and sp.user_id = public.current_tenant_id())
    and public.is_admin()
  );
comment on policy "salesperson_companies_tenant_admin_all" on public.salesperson_companies is
  'Herda o inquilino de salespersons, como sale_items herda de sales (019).';

create policy "salesperson_companies_vendor_select" on public.salesperson_companies
  for select to authenticated
  using (public.is_vendor() and salesperson_id in (select public.my_salesperson_ids()));
comment on policy "salesperson_companies_vendor_select" on public.salesperson_companies is
  'O vendedor lê só os próprios acessos.';

revoke all on public.salesperson_companies from anon;
grant select, insert, update, delete on public.salesperson_companies to authenticated;

-- ----------------------------------------- 11. funções do vendedor no modelo novo
-- O login aponta para UMA pessoa; o conjunto continua sendo setof para não mudar as chamadas.
create or replace function public.my_salesperson_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sp.id
    from public.salespersons sp
    join public.profiles p on p.id = sp.profile_id
   where sp.profile_id = auth.uid() and sp.is_active and p.is_active and p.role = 'vendedor'
$$;

create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct sc.company_id
    from public.salesperson_companies sc
   where sc.salesperson_id in (select public.my_salesperson_ids()) and sc.is_active
$$;

-- commission_summary(): a pessoa entra no recorte da empresa pelo ACESSO, não mais por
-- salespersons.company_id. O resto da função é idêntico — inclusive os números.
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
  where (
      (sp.is_active and exists (
        select 1 from public.salesperson_companies sc
         where sc.salesperson_id = sp.id and sc.company_id = p_company_id and sc.is_active))
      or p.salesperson_id is not null
    )
    and (public.is_admin() or sp.is_active)
  order by sp.name;
end;
$$;

revoke execute on function public.commission_summary(uuid, int, int[]) from public, anon;
grant execute on function public.commission_summary(uuid, int, int[]) to authenticated;

-- ------------------------------- 12. gatilho do "Site": uma pessoa por inquilino, N acessos
create or replace function public.create_site_salesperson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
begin
  select sp.id into v_site
    from public.salespersons sp
   where sp.user_id = new.user_id and lower(btrim(sp.name)) = 'site'
   limit 1;

  if v_site is null then
    insert into public.salespersons (user_id, name, is_active)
    values (new.user_id, 'Site', true)
    returning id into v_site;
  end if;

  insert into public.salesperson_companies (salesperson_id, company_id)
  values (v_site, new.id)
  on conflict (salesperson_id, company_id) do nothing;

  return new;
end;
$$;

comment on function public.create_site_salesperson() is
  'Dá à pessoa "Site" do inquilino acesso à empresa recém-criada; cria a pessoa se ainda não '
  'existir (022 — antes criava um cadastro "Site" por empresa).';

commit;
