// Backup lógico de PRODUÇÃO usando o pg_dump de dentro de um container — mesmo escopo do
// scripts/backup.sh, mas sem exigir cliente Postgres instalado na máquina (no Windows o pg_dump
// não está no PATH, e o backup.sh é bash).
//
// > Rodado à mão, por um humano. Nunca em CI, nunca por um agente de IA (Fase 1 §1).
//
// Produção entra em MODO LEITURA: os únicos comandos apontados para lá são `pg_dump` e um `select`
// de contagens. Nada aqui escreve em produção.
//
// Uso (na raiz do repo, com o Docker aberto):
//
//   # PowerShell
//   $env:SUPABASE_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
//   pnpm db:backup
//
//   # Git Bash
//   SUPABASE_DB_URL='postgresql://...' pnpm db:backup
//
// A URL vem do painel: Project Settings > Database > Connection string > URI, a do POOLER na porta
// 5432 (modo session). A 6543 (transaction) não funciona com pg_dump. Se não tiver a senha, resete
// em Project Settings > Database > Reset database password — não afeta o app, que usa anon/service_role.
//
// Saída em backups/, um par por execução (formato custom, restaura com pg_restore) e o retrato:
//   clock-society-<data>-public.dump   schema public: tabelas, views, funções, triggers, policies,
//                                      grants e DADOS
//   clock-society-<data>-auth.dump     dados de auth.users e auth.identities
//   clock-society-<data>-retrato.txt   contagem por tabela, para comparar depois da janela
//
// O que NÃO vem (configuração do projeto, refazer no painel ao restaurar em projeto novo): o hook
// "Customize Access Token" apontando para public.custom_access_token_hook, providers e URLs de
// redirect, e as chaves do projeto.
//
// ATENÇÃO: os arquivos têm dados reais e hashes de senha. A pasta backups/ está no .gitignore —
// guarde o par FORA do repositório e apague o que não precisa mais.

import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RETRATO_SQL, docker, fail, findDbContainer, requireDocker } from "./docker-psql.mjs";
import { exigeHumano, urlResumida } from "./homolog.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BACKUP_DIR = process.env.BACKUP_DIR || `${REPO_ROOT}backups`;
const ENV_FILE = process.env.BACKUP_ENV_FILE || `${REPO_ROOT}../.env`;
const IMAGEM = "postgres:17-alpine";

exigeHumano();

// ------------------------------------------------------------------ 1. URL de produção
let PROD_URL = process.env.SUPABASE_DB_URL;
if (!PROD_URL) {
  try {
    // Lê só a variável necessária, sem interpretar o arquivo inteiro.
    const hit = readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*(?:export\s+)?SUPABASE_DB_URL=/.test(l))
      .pop();
    if (hit) PROD_URL = hit.slice(hit.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* sem ../.env: só o ambiente */
  }
}

if (!PROD_URL) {
  fail(`SUPABASE_DB_URL não encontrada (ambiente ou ${ENV_FILE}).
     No PowerShell:  $env:SUPABASE_DB_URL="postgresql://..."    e depois  pnpm db:backup
     A senha do Postgres está em Project Settings > Database (resete lá se não a tiver).`);
}
if (/127\.0\.0\.1|localhost/.test(PROD_URL)) {
  fail("SUPABASE_DB_URL aponta para a sua máquina. Este script é o backup de PRODUÇÃO.");
}
// Os marcadores do exemplo (<regiao>, <senha>, <ref>) passariam direto e o pg_dump só reclamaria
// de DNS, bem depois, com o arquivo já aberto. Melhor recusar antes de tocar em qualquer coisa.
const marcadores = PROD_URL.match(/<[^>]+>/g);
if (marcadores) {
  fail(`a URL ainda tem ${marcadores.join(", ")} — é o exemplo, não a sua connection string.
     Copie a URI inteira do painel: Project Settings > Database > Connection string > URI,
     a do pooler na porta 5432 (session). O host real se parece com
     aws-1-sa-east-1.pooler.supabase.com — a região vem no próprio texto do painel.`);
}
if (/:6543\//.test(PROD_URL)) {
  fail(`a porta 6543 é o pooler em modo transaction e não funciona com pg_dump.
     Use a URL do pooler na porta 5432 (session).`);
}

// ------------------------------------------------- 2. de onde vem o pg_dump
// Preferimos o container do Supabase local, que já está na máquina. Sem ele, um container
// descartável só para esta execução (o --rm o apaga no fim).
requireDocker();
const CONTAINER = findDbContainer();
const noContainer = (comando) =>
  CONTAINER
    ? ["exec", "-i", "-e", `PROD_URL=${PROD_URL}`, CONTAINER, "sh", "-c", comando]
    : ["run", "--rm", "-i", "-e", `PROD_URL=${PROD_URL}`, IMAGEM, "sh", "-c", comando];

const versao = docker(noContainer("pg_dump --version")).stdout.trim();
if (!versao) {
  fail(`não consegui rodar o pg_dump ${CONTAINER ? `no container ${CONTAINER}` : `na imagem ${IMAGEM}`}.`);
}

console.log(`\n==> Origem : ${urlResumida(PROD_URL)}  (somente leitura)`);
console.log(`==> pg_dump: ${versao} ${CONTAINER ? `(container ${CONTAINER})` : `(container descartável, ${IMAGEM})`}`);

// ------------------------------------------- 2b. a conexão responde? (select 1, só leitura)
// Antes de abrir arquivo nenhum: assim um host errado ou uma senha errada dão mensagem clara,
// em vez de um erro de pg_dump com um .dump vazio já criado no disco.
{
  const teste = docker(noContainer('psql "$PROD_URL" -Atqc "select 1"'));
  if (teste.status !== 0) {
    const erro = (teste.stderr || teste.stdout || "").trim().split(/\r?\n/)[0];
    const dica = /could not translate host name|Name or service not known/i.test(erro)
      ? "o host não existe: confira a REGIÃO no painel (Connection string > URI)."
      : /password authentication failed/i.test(erro)
        ? "senha recusada: é a senha do Postgres, não a service_role. Resete em Project Settings > Database."
        : /Tenant or user not found/i.test(erro)
          ? "o usuário do pooler é postgres.<ref-do-projeto> — confira o <ref>."
          : /timeout|timed out|Connection refused/i.test(erro)
            ? "sem resposta: confira a porta (5432, session) e a rede."
            : "copie a URI inteira do painel, sem editar nada além da senha.";
    fail(`não consegui conectar em produção.\n     ${erro}\n     ${dica}`);
  }
}

// ------------------------------------------------------------ 3. dump (produção só é lida)
mkdirSync(BACKUP_DIR, { recursive: true });
try {
  chmodSync(BACKUP_DIR, 0o700);
} catch {
  /* no Windows o modo é ignorado */
}

const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const AUTH_DUMP = `${BACKUP_DIR}/clock-society-${STAMP}-auth.dump`;
const PUBLIC_DUMP = `${BACKUP_DIR}/clock-society-${STAMP}-public.dump`;
const RETRATO = `${BACKUP_DIR}/clock-society-${STAMP}-retrato.txt`;

/** Roda um comando no container e grava a saída binária num arquivo do host. */
function dumpTo(file, comando, rotulo) {
  console.log(`    ${rotulo} -> ${file}`);
  const fd = openSync(file, "w");
  try {
    const r = spawnSync("docker", noContainer(comando), {
      stdio: ["ignore", fd, "pipe"],
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
    if (r.status !== 0) {
      closeSync(fd);
      rmSync(file, { force: true }); // não deixa .dump pela metade no disco
      fail(`pg_dump falhou:\n${r.stderr}`);
    }
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* já fechado no caminho de erro */
    }
  }
  if (statSync(file).size === 0) {
    rmSync(file, { force: true });
    fail(`${file} saiu vazio.`);
  }
}

console.log("\n==> Lendo produção");
dumpTo(
  AUTH_DUMP,
  'pg_dump "$PROD_URL" --format=custom --no-owner --no-privileges --data-only' +
    " --table=auth.users --table=auth.identities",
  "auth.users + auth.identities",
);
// Sem --no-privileges: os GRANTs ao supabase_auth_admin (014) são o que deixa o hook de token ler
// public.profiles.
dumpTo(PUBLIC_DUMP, 'pg_dump "$PROD_URL" --format=custom --no-owner --schema=public', "schema public (schema + dados)");

// -------------------------------------------- 4. retrato dos números (select, só leitura)
const r = docker(noContainer('psql "$PROD_URL" -v ON_ERROR_STOP=1 -f -'), { input: RETRATO_SQL });
if (r.status !== 0) {
  console.log(`    ! não consegui tirar o retrato: ${(r.stderr || "").split("\n")[0]}`);
  console.log("      Tire à mão no SQL Editor (docs/fase-6/runbook.md, passo 2).");
} else {
  writeFileSync(RETRATO, `-- ${new Date().toISOString()} — ${urlResumida(PROD_URL)}\n${r.stdout}`);
  console.log(`    retrato -> ${RETRATO}`);
  console.log(r.stdout);
}

const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
console.log(`\n==> Pronto: ${kb(PUBLIC_DUMP)} public, ${kb(AUTH_DUMP)} auth, em ${BACKUP_DIR}`);
console.log(`
Guarde o par FORA do repositório antes de abrir a janela — rollback não substitui backup.

Para restaurar num projeto NOVO (nunca por cima de produção, sem decisão humana):
  pg_restore --dbname "<URL do destino>" --no-owner <arquivo>-public.dump
  pg_restore --dbname "<URL do destino>" --no-owner --data-only --disable-triggers <arquivo>-auth.dump
E refaça no painel o hook Customize Access Token -> public.custom_access_token_hook.
`);
