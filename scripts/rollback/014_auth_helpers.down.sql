-- Reverte a 014. ANTES: desabilitar o hook no painel (Authentication > Hooks), senão todo login
-- falha ao chamar uma função que não existe mais. Se a 015 estiver aplicada, reverta-a primeiro
-- (as políticas dela usam estas funções).

begin;

drop policy if exists "profile_salespersons_select" on public.profile_salespersons;
drop policy if exists "profiles_select_auth_hook" on public.profiles;
revoke select on public.profiles from supabase_auth_admin;

drop function if exists public.custom_access_token_hook(jsonb);
drop function if exists public.is_admin();
drop function if exists public.current_app_role();
drop function if exists public.current_tenant_id();

commit;
