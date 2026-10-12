-- Conserta clones feitos antes da correção: as colunas de token de auth.users precisam ser '' e
-- não NULL. O GoTrue lê essas colunas como string não-nula (Go), e com NULL o login falha com
-- 500 "Database error querying schema" e, no log do container, "Scan error on column index 3,
-- name confirmation_token: converting NULL to string is unsupported".
--
-- Uso (só no clone LOCAL):  pnpm db:sql scripts/local/corrige-auth-tokens.sql
--
-- Idempotente e restrito: só troca NULL por '' nessas colunas, e só nas que a sua versão do
-- GoTrue tiver. Nenhum outro dado é tocado.

do $$
declare
  col text;
  alvos text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ];
  afetadas int;
begin
  foreach col in array alvos loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users' and column_name = col
    ) then
      execute format('update auth.users set %I = '''' where %I is null', col, col);
      get diagnostics afetadas = row_count;
      if afetadas > 0 then
        raise notice 'auth.users.% : % linha(s) corrigida(s)', col, afetadas;
      end if;
    end if;
  end loop;
end $$;

select count(*) filter (where confirmation_token is null) as ainda_nulas,
       count(*) as total
  from auth.users;
