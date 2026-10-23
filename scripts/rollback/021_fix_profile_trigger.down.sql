-- Rollback da 021: volta o gatilho para AFTER INSERT, como a 013 o criou.
-- Atenção: com isto o POST /api/users volta a não conseguir criar usuário (o perfil não nasce
-- quando o GoTrue aplica o app_metadata no UPDATE). Ver docs/fase-6/vinculo-login-vendedor.md §3.

begin;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is null;

commit;
