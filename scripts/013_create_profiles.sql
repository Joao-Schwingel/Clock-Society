-- 013 — Identidade e papéis (planejamento 1.3 e §4.1; Fase 3, fatia 3.2).
-- Rollback: scripts/rollback/013_create_profiles.down.sql
-- NUNCA aplicada por CI nem por agente de IA — ver docs/fase-3/runbook.md.

begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  role text not null check (role in ('admin', 'vendedor')),
  full_name text,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_salespersons (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  salesperson_id uuid not null references public.salespersons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, salesperson_id),
  -- um registro de vendedor não pode pertencer a dois logins (A-DB-14)
  unique (salesperson_id)
);

create table public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

-- Catálogo (spec Fase 2 §3.1). Espelhado em lib/auth/permissions.ts — o teste A-PERM-01 lê este
-- insert como texto e compara. Fase 3 (D-6): só as linhas do admin.
insert into public.role_permissions (role, permission) values
  ('admin', 'dashboard.overview'),
  ('admin', 'commissions.view'),
  ('admin', 'sales.view'),
  ('admin', 'sales.view_costs'),
  ('admin', 'sales.write'),
  ('admin', 'sales.export'),
  ('admin', 'inventory.view'),
  ('admin', 'inventory.write'),
  ('admin', 'fixed_costs.manage'),
  ('admin', 'contracts.manage'),
  ('admin', 'salespersons.manage');

-- Perfil criado junto com o usuário, SÓ quando quem criou o usuário (service role, Fase 6)
-- informou papel e inquilino em app_metadata — que o próprio usuário não consegue alterar.
-- Sem isso, o usuário fica sem perfil e é negado por padrão (A-DB-07). O auto-cadastro está
-- desligado no painel; o admin atual ganha perfil pelo backfill (018).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_app_meta_data ? 'app_role' and new.raw_app_meta_data ? 'tenant_id' then
    insert into public.profiles (id, tenant_id, role, full_name)
    values (
      new.id,
      (new.raw_app_meta_data ->> 'tenant_id')::uuid,
      new.raw_app_meta_data ->> 'app_role',
      new.raw_user_meta_data ->> 'full_name'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: nega por padrão; nenhuma escrita pelo cliente (A-DB-12, A-DB-13).
alter table public.profiles enable row level security;
alter table public.profile_salespersons enable row level security;
alter table public.role_permissions enable row level security;

revoke all on public.profiles, public.profile_salespersons, public.role_permissions from anon, authenticated;
grant select on public.profiles, public.profile_salespersons, public.role_permissions to authenticated;

-- Políticas de profiles usam só auth.uid() e as claims do token — NUNCA as funções auxiliares,
-- que consultam profiles (recursão, planejamento §7.2).
create policy "profiles_select_self" on public.profiles
  for select to authenticated
  using (id = auth.uid());
comment on policy "profiles_select_self" on public.profiles is
  'Todo usuário lê o próprio perfil. Sem funções auxiliares, para não entrar em recursão (§7.2).';

create policy "profiles_select_tenant_admin" on public.profiles
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'app_role') = 'admin'
    and tenant_id = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
  );
comment on policy "profiles_select_tenant_admin" on public.profiles is
  'O admin lê os perfis do próprio inquilino. Lê o papel das claims do JWT, sem consultar profiles (§7.2).';

create policy "role_permissions_select" on public.role_permissions
  for select to authenticated
  using (true);
comment on policy "role_permissions_select" on public.role_permissions is
  'Catálogo público para usuários autenticados; escrita só por migration.';

commit;
