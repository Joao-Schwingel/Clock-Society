-- 014 — Funções auxiliares e hook de token (planejamento §4.2 e 1.3; Fase 3, fatia 3.2).
-- Rollback: scripts/rollback/014_auth_helpers.down.sql
-- NUNCA aplicada por CI nem por agente de IA — ver docs/fase-3/runbook.md.
--
-- Depois de aplicar: habilitar o hook no painel (Authentication > Hooks > Customize Access Token
-- → public.custom_access_token_hook). Sem o hook, as funções caem para profiles (A-DB-03).

begin;

-- Todas `stable security definer` com search_path fixo: ignoram o RLS de profiles (sem recursão)
-- e não podem ser sequestradas por search_path.

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    (select p.tenant_id from public.profiles p where p.id = auth.uid() and p.is_active)
  )
$$;

-- Não se chama current_role(): `current_role` é palavra reservada do SQL e, sem o schema,
-- resolveria para a função embutida do Postgres (spec Fase 2, decisão registrada).
create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'app_role', ''),
    (select p.role from public.profiles p where p.id = auth.uid() and p.is_active)
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

revoke execute on function public.current_tenant_id(), public.current_app_role(), public.is_admin() from public, anon;
grant execute on function public.current_tenant_id(), public.current_app_role(), public.is_admin() to authenticated;

-- Custom access token hook: injeta app_role e tenant_id em app_metadata (planejamento §3.2).
-- Usuário sem perfil, ou inativo, recebe token SEM essas claims — e o middleware o manda para /403.
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

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant select on public.profiles to supabase_auth_admin;
create policy "profiles_select_auth_hook" on public.profiles
  for select to supabase_auth_admin
  using (true);
comment on policy "profiles_select_auth_hook" on public.profiles is
  'O hook de token (rodando como supabase_auth_admin) lê o perfil para montar as claims.';

-- profile_salespersons: o admin lê os vínculos do inquilino; cada um lê os próprios. Escrita só
-- pela camada de servidor da Fase 6 (service role).
create policy "profile_salespersons_select" on public.profile_salespersons
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (
      public.is_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = profile_salespersons.profile_id
          and p.tenant_id = public.current_tenant_id()
      )
    )
  );
comment on policy "profile_salespersons_select" on public.profile_salespersons is
  'Admin lê os vínculos do inquilino; cada usuário lê os próprios. Sem escrita pelo cliente.';

commit;
