-- 021 — O perfil passa a nascer também quando o app_metadata chega depois do INSERT.
-- Rollback: scripts/rollback/021_fix_profile_trigger.down.sql
-- NUNCA aplicada por CI nem por agente de IA — aplicação manual.
-- Diagnóstico completo: docs/fase-6/vinculo-login-vendedor.md §3.
--
-- Problema: `on_auth_user_created` (013) é AFTER INSERT e só cria o perfil se `raw_app_meta_data`
-- já trouxer `app_role` e `tenant_id` naquele INSERT. O `admin.createUser` do GoTrue — que é o que
-- o POST /api/users usa — grava o usuário primeiro e aplica o `app_metadata` num UPDATE posterior.
-- Resultado: o perfil nunca nascia, o vínculo quebrava na FK (23503) e o serviço desfazia o login.
-- Com isto, nenhum usuário podia ser criado pela tela de Usuários.
--
-- Correção: o gatilho também roda no UPDATE de `raw_app_meta_data`. A função continua a mesma e já
-- era idempotente (`on conflict (id) do nothing`), então rodar duas vezes para o mesmo usuário não
-- duplica nem sobrescreve nada — inclusive não desfaz um `full_name` ou `role` ajustado depois.
--
-- Verificação: V-LINK-19 e V-LINK-20 em scripts/local/testes-banco/vinculo-usuario-vendedor.mjs.
-- Depois desta migration, a V-LINK-20 deixa de ser LACUNA e deve virar OK (o relatório acusa
-- "MUDOU" até alguém promover o caso).

begin;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Cria public.profiles a partir de app_role/tenant_id do raw_app_meta_data. Roda no INSERT e '
  'também no UPDATE dessa coluna, porque o admin.createUser do GoTrue aplica o app_metadata '
  'depois de inserir o usuário (021).';

commit;
