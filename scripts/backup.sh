#!/usr/bin/env bash
# Backup lógico do Postgres do Supabase via pg_dump: schema public + usuários do Auth.
# (Storage não é usado pelo app, então não entra.)
#
# Uso:  ./scripts/backup.sh
#
# Lê SUPABASE_DB_URL de ../.env (um nível acima da raiz do repo), ou de outro
# arquivo apontado por BACKUP_ENV_FILE. Se SUPABASE_DB_URL já estiver no ambiente,
# ele tem precedência.
#
# SUPABASE_DB_URL = connection string do Postgres (Project Settings → Database).
# Sem IPv6, use a do pooler (porta 5432, modo session).
#
# Saída em <raiz do repo>/backups/ (formato custom, restaura com pg_restore), um par por execução:
#   clock-society-<data>-public.dump   schema + dados do public
#   clock-society-<data>-auth.dump     dados de auth.users e auth.identities
# Mantém os últimos BACKUP_KEEP pares (padrão 14).
#
# NÃO estão no dump (config do projeto, refazer no dashboard ao restaurar em projeto novo):
# Auth Hook "Customize Access Token" apontando para public.custom_access_token_hook,
# providers/URLs de redirect, e a chave/segredos do projeto.
#
# ATENÇÃO: o dump tem dados reais e hashes de senha. Não versionar; a pasta backups/
# deve estar no .gitignore.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$REPO_ROOT/../.env}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
KEEP="${BACKUP_KEEP:-14}"

# Lê só a variável necessária, sem dar source no arquivo inteiro.
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ENV_FILE" ]]; then
  line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?SUPABASE_DB_URL=' "$ENV_FILE" | tail -n1 || true)"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  SUPABASE_DB_URL="$value"
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Erro: SUPABASE_DB_URL não encontrada (ambiente ou $ENV_FILE)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Erro: pg_dump não instalado (pacote postgresql / postgresql-client)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date +%F_%H%M%S)"
PUBLIC_OUT="$BACKUP_DIR/clock-society-$STAMP-public.dump"
AUTH_OUT="$BACKUP_DIR/clock-society-$STAMP-auth.dump"

umask 077

# 1) Schema public inteiro (schema + dados): tabelas, views, funções (RLS helpers e
#    custom_access_token_hook), triggers (handle_new_user) e policies.
#    SEM --no-privileges: os GRANTs ao supabase_auth_admin (014_auth_helpers.sql) são
#    o que permite o hook de token ler public.profiles.
echo "Gerando $PUBLIC_OUT ..."
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --schema=public \
  --file="$PUBLIC_OUT"

# 2) Só os DADOS de usuários do Auth. public.profiles tem FK para auth.users(id), então
#    sem isso o backup do public não restaura. Só dados: o schema auth já existe em todo
#    projeto Supabase e é gerenciado por eles (dump do schema colidiria na restauração).
echo "Gerando $AUTH_OUT ..."
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --data-only \
  --table=auth.users \
  --table=auth.identities \
  --file="$AUTH_OUT"

echo "OK: $(du -h "$PUBLIC_OUT" | cut -f1) public, $(du -h "$AUTH_OUT" | cut -f1) auth"

# Rotação: mantém os KEEP pares mais recentes.
for kind in public auth; do
  mapfile -t old < <(ls -1t "$BACKUP_DIR"/clock-society-*-"$kind".dump 2>/dev/null | tail -n +"$((KEEP + 1))")
  if (( ${#old[@]} > 0 )); then
    printf 'Removendo %d backup(s) %s antigo(s)\n' "${#old[@]}" "$kind"
    rm -f -- "${old[@]}"
  fi
done
