-- Reverte a 013. Antes: reverter a 014 (as funções e o hook dependem destas tabelas) e, se já
-- aplicada, a 015.

begin;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.profile_salespersons;
drop table if exists public.role_permissions;
drop table if exists public.profiles;

commit;
