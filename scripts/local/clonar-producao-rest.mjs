// Clona produção num Supabase LOCAL descartável SEM a senha do Postgres: lê tudo pela API
// (PostgREST + Auth Admin) com a service_role_key, e monta o schema local pelas migrations.
//
// > Rodado à mão, por um humano, num terminal interativo. Nunca em CI, nunca por um agente de IA
// > (mesma trava dos helpers da Fase 2 — scripts/manual/fase-2/guard.mjs).
//
// Produção é usada em MODO LEITURA: só requisições GET. Nenhum POST/PATCH/DELETE sai daqui.
//
// Uso (na raiz do repo, com o Docker aberto):
//   pnpm db:clone:rest
//
// Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env (ou do ambiente).
// Senha dos logins no clone: CLONE_TEST_PASSWORD (padrão "clone-local").
//
// Diferenças em relação ao `pnpm db:clone` (pg_dump), que são o preço de não ter a senha do banco:
//   - o schema vem das MIGRATIONS (001–009, pular a 010, 011 e as views — receita do cabeçalho da
//     011), não de produção. Divergência de schema é RELATADA no fim, não reproduzida;
//   - a Auth Admin API não entrega hash de senha: todos os logins ficam com a MESMA senha de
//     teste. Os ids e e-mails são preservados, então os dados continuam consistentes;
//   - vêm só as tabelas expostas na API REST, com os dados. Funções, triggers e policies vêm das
//     migrations, não de produção.
//
// ATENÇÃO: o despejo em backups/ tem dados reais. A pasta está no .gitignore.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { buildLoadSql } from "./clone-rest-sql.mjs";
import {
  fail,
  psql as psqlRaw,
  psqlList as psqlListRaw,
  publicTableCount,
  requireDbContainer,
} from "./docker-psql.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Receita do cabeçalho da 011 para um banco NOVO: 001–009 (a 002 é só comentário), pular a 010
// (a 011 faz o que ela faz), a 011 e depois as views. A scripts/alteracoes/10_01.sql não entra:
// cria um gatilho que produção não tem.
const MIGRATIONS = [
  "scripts/001_create_tables.sql",
  "scripts/003_add_salesperson.sql",
  "scripts/004_create_contracts.sql",
  "scripts/005_create_sale_costs.sql",
  "scripts/005_migrate_contracts.sql",
  "scripts/006_add_sale_status.sql",
  "scripts/007_create_fixed_costs.sql",
  "scripts/008_create_salespersons.sql",
  "scripts/009_seed_site_salesperson.sql",
  "scripts/011_reconcile_schema.sql",
  "scripts/views/sales_with_details.sql",
  "scripts/views/sales_with_salespersons.sql",
  "scripts/views/salesperson_summary.sql",
];

// Views expostas na API: têm dados, mas não se restauram (vêm das definições em scripts/views/).
const VIEWS = ["sales_with_details", "sales_with_salespersons", "salesperson_summary"];

// Quantas linhas por página no GET ao PostgREST.
const PAGE = 1000;

// O alvo de TODA escrita (o Postgres local, visto de dentro do container) e o psql vêm de
// docker-psql.mjs — este script não tem como apontar para outro banco.

// ------------------------------------------------------------ trava: humano, terminal, nunca CI
if (process.env.CI) fail("CI detectado. Este script é do checklist MANUAL e nunca roda em CI.");
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail("Terminal não interativo. Só roda à mão, por um humano, num terminal.");
}

// ------------------------------------------------------------------- credenciais (só a origem)
const env = (() => {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(`${REPO_ROOT}.env`, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, raw] = m;
      if (out[key]) continue; // ambiente ganha do arquivo
      out[key] = raw.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sem .env: só o ambiente */
  }
  return out;
})();

const SRC_URL = (env.CLONE_SOURCE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SRC_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = env.CLONE_TEST_PASSWORD || "clone-local";

if (!SRC_URL) fail("NEXT_PUBLIC_SUPABASE_URL não encontrada (.env ou ambiente).");
if (!SRC_KEY) fail("SUPABASE_SERVICE_ROLE_KEY não encontrada (.env ou ambiente).");

const srcHost = new URL(SRC_URL).hostname;
if (srcHost === "localhost" || srcHost === "127.0.0.1") {
  fail(`a origem (${SRC_URL}) é local. Este script clona um Supabase REMOTO no local.`);
}

// ------------------------------------------------------------------------ docker e psql locais
const DB = requireDbContainer(REPO_ROOT);

const psql = (sql, options) => psqlRaw(DB, sql, options);
const psqlList = (sql) => psqlListRaw(DB, sql);
const countLocal = (table) => Number(psqlList(`select count(*) from public.${table};`)[0] || "0");

// ----------------------------------------------------------- o public local tem que estar vazio
const localTableCount = publicTableCount(DB);
if (localTableCount !== 0) {
  fail(
    `o schema public do banco local já tem ${localTableCount} tabela(s) — não vou escrever por cima.\n` +
      "     Para começar de um banco limpo: pnpm db:local:apagar && pnpm db:local",
  );
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  `\nLer ${SRC_URL} (somente leitura, com a service_role_key) e montar o clone em ${DB}?\n` +
    'Digite "sim" para continuar: ',
);
rl.close();
if (answer.trim().toLowerCase() !== "sim") fail("Cancelado.");

// --------------------------------------------------------------------------- API de produção
async function api(path) {
  const res = await fetch(`${SRC_URL}${path}`, {
    headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

console.log("\n==> Catálogo de produção (OpenAPI do PostgREST)");
let prodColumns = new Map(); // objeto exposto -> Set(colunas)
try {
  const spec = await api("/rest/v1/");
  for (const [name, def] of Object.entries(spec.definitions || {})) {
    prodColumns.set(name, new Set(Object.keys(def.properties || {})));
  }
} catch (err) {
  console.log(`    ! OpenAPI indisponível (${err.message}). Vou usar a lista de tabelas do repo.`);
}
if (prodColumns.size === 0) {
  for (const t of ["companies", "sales", "sale_items", "sale_salespersons", "sale_costs", "costs",
    "inventory", "fixed_costs", "contracts", "salespersons", "salesperson_companies", "profiles",
    "role_permissions"]) {
    prodColumns.set(t, null); // null = descobrir as colunas pelas linhas lidas
  }
}
const prodTables = [...prodColumns.keys()].filter((t) => !VIEWS.includes(t)).sort();
console.log(`    ${prodTables.length} tabela(s): ${prodTables.join(", ")}`);

// ------------------------------------------- dados de produção ANTES de tocar no banco local
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = `${REPO_ROOT}backups/rest-clone-${STAMP}`;
mkdirSync(OUT, { recursive: true });

console.log("\n==> Lendo os dados (GET paginado)");
const data = new Map();
for (const table of prodTables) {
  const order = prodColumns.get(table)?.has("id") === false ? "" : "&order=id.asc";
  const rows = [];
  try {
    for (let offset = 0; ; offset += PAGE) {
      const page = await api(`/rest/v1/${table}?select=*${order}&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  } catch (err) {
    console.log(`    - ${table}: não existe em produção (${err.message.slice(0, 60)})`);
    continue;
  }
  data.set(table, rows);
  if (!prodColumns.get(table) && rows.length > 0) prodColumns.set(table, new Set(Object.keys(rows[0])));
  writeFileSync(`${OUT}/${table}.json`, JSON.stringify(rows));
  console.log(`    ${table}: ${rows.length} linha(s)`);
}

console.log("\n==> Lendo os usuários do Auth (Admin API)");
const users = [];
for (let page = 1; ; page++) {
  const body = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
  const batch = body.users || [];
  users.push(...batch);
  if (batch.length < 200) break;
}
writeFileSync(`${OUT}/auth-users.json`, JSON.stringify(users));
console.log(`    ${users.length} usuário(s): ${users.map((u) => u.email).join(", ")}`);

// ------------------------------------------------------------------- schema local (migrations)
console.log("\n==> Montando o schema local pelas migrations");
for (const file of MIGRATIONS) {
  process.stdout.write(`    ${file} ... `);
  psql(readFileSync(`${REPO_ROOT}${file}`, "utf8"), { raw: true });
  console.log("ok");
}

// Dois conjuntos por tabela: todas as colunas (para o relatório de divergência) e só as que
// aceitam INSERT. Coluna GERADA (sale_items.total_price, na 011) vem na API mas não pode ser
// inserida — "cannot insert a non-DEFAULT value into column".
const localCols = new Map();
const localInsertable = new Map();
for (const row of psqlList(
  `select c.table_name || '|' || c.column_name || '|' ||
          case when c.is_generated = 'ALWAYS'
                 or (c.is_identity = 'YES' and c.identity_generation = 'ALWAYS')
               then 'gerada' else 'insert' end
     from information_schema.columns c
     join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
    where c.table_schema = 'public'
    order by 1;`,
)) {
  const [t, col, kind] = row.split("|");
  if (!localCols.has(t)) localCols.set(t, new Set());
  if (!localInsertable.has(t)) localInsertable.set(t, new Set());
  localCols.get(t).add(col);
  if (kind === "insert") localInsertable.get(t).add(col);
}

// ------------------------------------------------------------------------------ SQL de carga
const columnsOf = (schema, table) =>
  new Set(
    psqlList(
      `select column_name from information_schema.columns
        where table_schema = '${schema}' and table_name = '${table}';`,
    ),
  );

const semTabela = [];
const tabelas = [];
for (const [table, rows] of data) {
  if (!localCols.has(table)) {
    semTabela.push(table);
    continue;
  }
  tabelas.push({
    name: table,
    rows,
    prodCols: prodColumns.get(table),
    localCols: localInsertable.get(table), // o gerador só recebe colunas que aceitam insert
  });
}

const { sql: loadSql } = buildLoadSql({
  users,
  authCols: columnsOf('auth', 'users'),
  identityCols: columnsOf('auth', 'identities'),
  tables: tabelas,
  password: TEST_PASSWORD,
});

const loadFile = `${OUT}/load.sql`;
writeFileSync(loadFile, loadSql);
console.log(`\n==> SQL de carga gravado: ${loadFile}`);

console.log("==> Carregando no clone local");
psql(loadSql, { raw: true });

// --------------------------------------------------------------------------- conferência final
console.log("\n==> Produção vs. clone");
let divergiu = false;
for (const [table, rows] of data) {
  if (!localCols.has(table)) continue;
  const local = countLocal(table);
  const ok = local === rows.length;
  if (!ok) divergiu = true;
  console.log(`    ${ok ? " " : "!"} ${table.padEnd(22)} produção ${String(rows.length).padStart(6)}   clone ${String(local).padStart(6)}`);
}
const localUsers = Number(psqlList("select count(*) from auth.users;")[0] || "0");
console.log(`    ${localUsers === users.length ? " " : "!"} ${"auth.users".padEnd(22)} produção ${String(users.length).padStart(6)}   clone ${String(localUsers).padStart(6)}`);

console.log("\n==> Divergência de schema (produção pela API vs. migrations locais)");
let avisos = 0;
for (const table of prodTables) {
  const prod = prodColumns.get(table);
  const local = localCols.get(table);
  if (!local) {
    if (data.has(table)) {
      console.log(`    ! ${table}: existe em produção e nenhuma migration do repo cria`);
      avisos++;
    }
    continue;
  }
  if (!prod) continue;
  const faltam = [...prod].filter((c) => !local.has(c));
  const sobram = [...local].filter((c) => !prod.has(c));
  if (faltam.length) {
    console.log(`    ! ${table}: em produção e não no clone -> ${faltam.join(", ")} (DADO PERDIDO)`);
    avisos += faltam.length;
  }
  if (sobram.length) {
    console.log(`    ~ ${table}: no clone e não em produção -> ${sobram.join(", ")} (ficou no default)`);
    avisos += sobram.length;
  }
}
if (avisos === 0) console.log("    nenhuma: o schema das migrations bate com a API de produção.");
if (semTabela.length > 0) console.log(`    ! sem tabela local, dados não carregados: ${semTabela.join(", ")}`);

// Chaves do stack local, para montar o .env.local sem o usuário ter que ir atrás.
const status = spawnSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});
const statusValue = (name) =>
  new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(status.stdout || "")?.[1] ?? `<${name}>`;

console.log(`
==> Pronto${divergiu ? " (com contagens divergentes acima — confira antes de confiar no clone)" : ""}.

Logins do clone: os e-mails de produção, todos com a senha "${TEST_PASSWORD}".
Se a sua senha real funcionar, você está em PRODUÇÃO, não no clone.

1) Apontar o app para o clone: crie o arquivo .env.local na raiz do repo com o conteúdo abaixo.
   O Next.js dá precedência ao .env.local sobre o .env, então produção fica intacta; o arquivo
   está no .gitignore. Depois rode "pnpm dev" normalmente, sem variável na linha de comando.

NEXT_PUBLIC_SUPABASE_URL=${statusValue("API_URL")}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${statusValue("ANON_KEY")}
SUPABASE_SERVICE_ROLE_KEY=${statusValue("SERVICE_ROLE_KEY")}

   Para voltar a produção, apague o .env.local. (Os testes E2E não são afetados: o
   playwright.config.ts define as três variáveis do mock server por conta própria.)

2) O clone nasce com o schema das migrations 001–011. Produção está na FASE 3, então para o clone
   ficar igual a ela, aplique estas cinco (o 018 recria o perfil do admin — profiles e
   role_permissions não vêm nos dados, porque as tabelas ainda não existiam na carga):
  pnpm db:sql scripts/013_create_profiles.sql
  pnpm db:sql scripts/014_auth_helpers.sql
  pnpm db:sql scripts/015_rewrite_policies.sql
  pnpm db:sql scripts/017_indexes.sql
  pnpm db:sql scripts/018_backfill_admin.sql

   A partir daqui o clone espelha produção. Para ENSAIAR a janela da Fase 6 (que produção ainda
   não tem), aplique por cima, nesta ordem — não é a numérica:
  pnpm db:sql scripts/019_fix_missing_rls.sql
  pnpm db:sql scripts/020_vendor_policies.sql
  pnpm db:sql scripts/016_vendor_views.sql
  pnpm db:sql scripts/021_fix_profile_trigger.sql
  pnpm db:sql scripts/022_vendedor_por_pessoa.sql
   Passo a passo com as conferências de cada uma: docs/fase-6/runbook.md

3) Ao terminar, apague o clone — ele tem dados reais:
  pnpm db:local:apagar
`);
