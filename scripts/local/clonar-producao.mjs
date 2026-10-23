// Clona o banco de PRODUÇÃO num Supabase LOCAL descartável (Docker), para testar sem tocar em
// nada que está lá. Caminho com pg_dump: precisa da senha do Postgres.
//
// Produção entra em MODO LEITURA: o único comando apontado para lá é o pg_dump. Tudo que escreve
// (pg_restore) aponta para o Postgres DENTRO do container local.
//
// > Rodado à mão, por um humano. Nunca por um agente de IA (Fase 1 §1).
//
// Uso (na raiz do repo, com o Docker aberto):
//
//   # PowerShell
//   $env:SUPABASE_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
//   pnpm db:clone
//
//   # Git Bash
//   SUPABASE_DB_URL='postgresql://...' pnpm db:clone
//
// A URL vem do painel: Project Settings > Database > Connection string > URI. Use a do POOLER na
// porta 5432 (modo session); a 6543 (transaction) não funciona com pg_dump. Se SUPABASE_DB_URL já
// estiver em ../.env (mesma convenção do scripts/backup.sh), não precisa passar nada.
//
// O que vem de produção (mesmo escopo do scripts/backup.sh):
//   - schema public inteiro: tabelas, views, funções, triggers, policies, grants e DADOS
//   - dados de auth.users e auth.identities (logins e hashes de senha reais)
// O que NÃO vem: a configuração do projeto (hook de access token, providers, URLs de redirect) --
// o hook já está ligado em supabase/config.toml; e o storage, que o app não usa.
//
// ATENÇÃO: os dumps em backups/ têm dados reais e hashes de senha. A pasta está no .gitignore.
// Apague o banco local quando terminar: pnpm db:local:apagar

import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, closeSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  LOCAL_URL, RETRATO_SQL, docker, fail, psql, publicTableCount, requireDbContainer,
} from "./docker-psql.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BACKUP_DIR = process.env.BACKUP_DIR || `${REPO_ROOT}backups`;
const ENV_FILE = process.env.BACKUP_ENV_FILE || `${REPO_ROOT}../.env`;

// ------------------------------------------------------------------ 1. URL de produção
let PROD_URL = process.env.SUPABASE_DB_URL;
if (!PROD_URL) {
  try {
    // Lê só a variável necessária, sem interpretar o arquivo inteiro.
    const lines = readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
    const hit = lines.filter((l) => /^\s*(?:export\s+)?SUPABASE_DB_URL=/.test(l)).pop();
    if (hit) PROD_URL = hit.slice(hit.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* sem ../.env: só o ambiente */
  }
}

if (!PROD_URL) {
  fail(`SUPABASE_DB_URL não encontrada (ambiente ou ${ENV_FILE}).
     No PowerShell:  $env:SUPABASE_DB_URL="postgresql://..."    e depois  pnpm db:clone
     Sem a senha do banco, use: pnpm db:clone:rest`);
}
if (/127\.0\.0\.1|localhost/.test(PROD_URL)) {
  fail("SUPABASE_DB_URL aponta para a sua máquina; preciso da URL de PRODUÇÃO (só leitura).");
}
if (/:6543\//.test(PROD_URL)) {
  fail(`a porta 6543 é o pooler em modo transaction e não funciona com pg_dump.
     Use a URL do pooler na porta 5432 (session).`);
}

// ------------------------------------------------------------ 2. Docker + Supabase local
const DB = requireDbContainer(REPO_ROOT);
console.log(`==> Container local: ${DB}`);

const tabelas = publicTableCount(DB);
if (tabelas !== 0) {
  fail(`o schema public do banco local já tem ${tabelas} tabela(s) -- não vou restaurar por cima.
     Para começar de um banco limpo: pnpm db:local:apagar && pnpm db:local`);
}

// ----------------------------------------------- 3. Dump de produção (somente leitura)
mkdirSync(BACKUP_DIR, { recursive: true });
try {
  chmodSync(BACKUP_DIR, 0o700);
} catch {
  /* no Windows o modo é ignorado */
}

const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const AUTH_DUMP = `${BACKUP_DIR}/clock-society-${STAMP}-auth.dump`;
const PUBLIC_DUMP = `${BACKUP_DIR}/clock-society-${STAMP}-public.dump`;
const LOG = `${BACKUP_DIR}/clone-${STAMP}.log`;

const versao = docker(["exec", "-i", DB, "pg_dump", "--version"]).stdout.trim();
console.log(`==> Lendo produção com o pg_dump do container (${versao})`);

/** Roda um comando no container e grava a saída padrão (binária) num arquivo do host. */
function dumpTo(file, shellCommand, label) {
  console.log(`    ${label} -> ${file}`);
  const fd = openSync(file, "w");
  try {
    const r = spawnSync(
      "docker",
      ["exec", "-i", "-e", `PROD_URL=${PROD_URL}`, DB, "sh", "-c", shellCommand],
      { stdio: ["ignore", fd, "pipe"], encoding: "utf8", maxBuffer: 1 << 28 },
    );
    if (r.status !== 0) fail(`pg_dump falhou:\n${r.stderr}`);
  } finally {
    closeSync(fd);
  }
}

dumpTo(
  AUTH_DUMP,
  'pg_dump "$PROD_URL" --format=custom --no-owner --no-privileges --data-only' +
    " --table=auth.users --table=auth.identities",
  "auth.users + auth.identities",
);

// Sem --no-privileges: os GRANTs ao supabase_auth_admin (014) são o que deixa o hook de token
// ler public.profiles.
dumpTo(
  PUBLIC_DUMP,
  'pg_dump "$PROD_URL" --format=custom --no-owner --schema=public',
  "schema public (schema + dados)",
);

// ---------------------------------------------------------- 4. Restaurar no banco local
console.log("==> Restaurando no local (alvo: 127.0.0.1:5432, dentro do container)");

function restaurar(file, extraFlags = []) {
  const fd = openSync(file, "r");
  try {
    const r = spawnSync(
      "docker",
      [
        "exec", "-i", "-e", `LOCAL_URL=${LOCAL_URL}`, "-e", `FLAGS=${extraFlags.join(" ")}`,
        DB, "sh", "-c", 'pg_restore --dbname "$LOCAL_URL" --no-owner $FLAGS',
      ],
      { stdio: [fd, "pipe", "pipe"], encoding: "utf8", maxBuffer: 1 << 28 },
    );
    const saida = `${r.stdout || ""}${r.stderr || ""}`;
    appendFileSync(LOG, saida);
    return saida;
  } finally {
    closeSync(fd);
  }
}

// auth primeiro: public.profiles tem FK para auth.users.
// --disable-triggers porque o pg_dump ordena auth.identities antes de auth.users.
const saidaAuth = restaurar(AUTH_DUMP, ["--data-only", "--no-privileges", "--disable-triggers"]);
const saidaPublic = restaurar(PUBLIC_DUMP);

const erros = `${saidaAuth}${saidaPublic}`.split(/\r?\n/).filter((l) => /pg_restore: error/i.test(l));
if (erros.length > 0) {
  console.log(`    ${erros.length} linha(s) de erro no restore (veja ${LOG}).`);
  console.log('    São esperados: `schema "public" already exists` e tabelas de auth que a versão');
  console.log("    local não tem. O que vale é o retrato abaixo: tem que bater com produção.");
}

// ------------------------------------------------------------------------- 5. Retrato
console.log("\n==> Retrato do clone (como postgres, sem RLS). Compare com produção:");
console.log(psql(DB, RETRATO_SQL, { raw: true }));

const status = spawnSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
  cwd: REPO_ROOT, encoding: "utf8", shell: process.platform === "win32",
});
const chave = (nome) =>
  new RegExp(`^${nome}="?([^"\\r\\n]+)"?`, "m").exec(status.stdout || "")?.[1] ?? `<${nome}>`;

const tamanho = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
console.log(`==> Dumps: ${tamanho(PUBLIC_DUMP)} public, ${tamanho(AUTH_DUMP)} auth, em ${BACKUP_DIR}`);

console.log(`
==> Pronto. Logins do clone: os de produção, com as senhas reais (os hashes vieram no dump).

1) Apontar o app para o clone: crie o arquivo .env.local na raiz do repo com o conteúdo abaixo.
   O Next.js dá precedência ao .env.local sobre o .env, então produção fica intacta; o arquivo
   está no .gitignore. Depois rode "pnpm dev" normalmente.

NEXT_PUBLIC_SUPABASE_URL=${chave("API_URL")}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${chave("ANON_KEY")}
SUPABASE_SERVICE_ROLE_KEY=${chave("SERVICE_ROLE_KEY")}

   Para voltar a produção, apague o .env.local.

2) Aplicar migrations no clone, uma por uma:
  pnpm db:sql scripts/013_create_profiles.sql

3) Ao terminar, apague o clone -- ele tem dados reais:
  pnpm db:local:apagar
`);
