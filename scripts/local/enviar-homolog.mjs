// Envia o CLONE LOCAL para o projeto de HOMOLOGAÇÃO do Supabase.
//
// > Rodado à mão, por um humano. Nunca em CI, nunca por um agente de IA.
// > Nunca escreve em produção: a trava de homolog.mjs recusa a URL do projeto do .env.
//
// Serve para montar o banco do preview da Vercel com os dados reais, sem precisar da senha do
// Postgres de produção: quem leu produção foi o `pnpm db:clone:rest`, por HTTPS.
//
// Uso (PowerShell, na raiz do repo):
//
//   $env:HOMOLOG_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
//   pnpm db:enviar-homolog
//
// A URL vem do painel do projeto de homologação: Project Settings > Database > Connection string >
// URI, a do POOLER na porta 5432 (modo session).
//
// O que vai: o schema `public` inteiro do clone (tabelas, views, funções, triggers, policies,
// grants e DADOS) e, por padrão, os dados de `auth.users`/`auth.identities`.
//
// ATENÇÃO: os logins levam junto os hashes de senha que vieram de produção. Se preferir um
// homologação sem senha real, rode com SEM_LOGINS=1 e crie os usuários depois com
// scripts/manual/fase-2/seed-usuarios.mjs.
//
// O que NÃO vai: a configuração do projeto. Depois de rodar, ligue no painel do homologação
// Authentication > Hooks > Customize Access Token → public.custom_access_token_hook. Sem isso
// ninguém entra com papel.

import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { RETRATO_SQL, docker, fail, psql, publicTableCount, requireDbContainer } from "./docker-psql.mjs";
import { alvoHomolog, exigeHumano, urlResumida } from "./homolog.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BACKUP_DIR = `${REPO_ROOT}backups`;
const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const SEM_LOGINS = process.env.SEM_LOGINS === "1";

exigeHumano();
const DESTINO = alvoHomolog();

const DB = requireDbContainer(REPO_ROOT, { autoStart: false });
const tabelas = publicTableCount(DB);
if (tabelas === 0) {
  fail(`o clone local está vazio (nenhuma tabela em public).
     Monte-o antes:  pnpm db:clone:rest`);
}

console.log(`\n==> Origem : clone local (${DB}), ${tabelas} tabela(s) em public`);
console.log(`==> Destino: ${urlResumida(DESTINO)}`);
console.log(`==> Logins : ${SEM_LOGINS ? "NÃO vão (SEM_LOGINS=1)" : "vão junto, com os hashes de produção"}`);
console.log("\nRetrato do que será enviado:");
console.log(psql(DB, RETRATO_SQL, { raw: true }));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const resposta = await rl.question('Enviar para o projeto acima? Digite "sim" para continuar: ');
rl.close();
if (resposta.trim().toLowerCase() !== "sim") fail("Cancelado.");

// ------------------------------------------------------------------ 1. dump do clone local
mkdirSync(BACKUP_DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const AUTH_DUMP = `${BACKUP_DIR}/homolog-${STAMP}-auth.dump`;
const PUBLIC_DUMP = `${BACKUP_DIR}/homolog-${STAMP}-public.dump`;

/** Roda um comando no container e grava a saída binária num arquivo do host. */
function dumpTo(file, comando, rotulo) {
  console.log(`    ${rotulo} -> ${file}`);
  const fd = openSync(file, "w");
  try {
    const r = spawnSync("docker", ["exec", "-i", "-e", `U=${LOCAL_URL}`, DB, "sh", "-c", comando], {
      stdio: ["ignore", fd, "pipe"],
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
    if (r.status !== 0) fail(`pg_dump falhou:\n${r.stderr}`);
  } finally {
    closeSync(fd);
  }
}

console.log("\n==> Lendo o clone local");
if (!SEM_LOGINS) {
  dumpTo(
    AUTH_DUMP,
    'pg_dump "$U" --format=custom --no-owner --no-privileges --data-only' +
      " --table=auth.users --table=auth.identities",
    "auth.users + auth.identities",
  );
}
// Sem --no-privileges: os GRANTs ao supabase_auth_admin (014) são o que deixa o hook ler profiles.
dumpTo(PUBLIC_DUMP, 'pg_dump "$U" --format=custom --no-owner --schema=public', "schema public (schema + dados)");

// ------------------------------------------------ 2. restaurar no projeto de homologação
console.log("\n==> Restaurando no homologação (pg_restore de dentro do container)");

function restaurar(file, flags = []) {
  const fd = openSync(file, "r");
  try {
    const r = spawnSync(
      "docker",
      [
        "exec", "-i", "-e", `DEST=${DESTINO}`, "-e", `FLAGS=${flags.join(" ")}`,
        DB, "sh", "-c", 'pg_restore --dbname "$DEST" --no-owner $FLAGS',
      ],
      { stdio: [fd, "pipe", "pipe"], encoding: "utf8", maxBuffer: 1 << 28 },
    );
    return `${r.stdout || ""}${r.stderr || ""}`;
  } finally {
    closeSync(fd);
  }
}

let saida = "";
// auth primeiro: public.profiles tem FK para auth.users.
if (!SEM_LOGINS) saida += restaurar(AUTH_DUMP, ["--data-only", "--no-privileges", "--disable-triggers"]);
saida += restaurar(PUBLIC_DUMP);

const erros = saida.split(/\r?\n/).filter((l) => /pg_restore: error/i.test(l));
if (erros.length > 0) {
  console.log(`    ${erros.length} linha(s) de erro. São esperados "schema public already exists" e`);
  console.log("    tabelas de auth que a versão do projeto não tem. As primeiras:");
  for (const linha of erros.slice(0, 5)) console.log(`      ${linha}`);
}

// ------------------------------- 3. o gatilho de auth.users, que o dump do public não leva
// `pg_dump --schema=public` não carrega gatilhos que vivem em OUTRO schema, e o
// on_auth_user_created mora em auth.users. Sem ele, criar usuário pelo painel (ou por qualquer
// caminho fora do /api/users) não cria o perfil. Recria com a definição da 021 — idempotente.
const TRIGGER_SQL = `
do $$
begin
  if to_regprocedure('public.handle_new_user()') is null then
    raise notice 'handle_new_user() não existe no destino: gatilho NÃO recriado';
    return;
  end if;
  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created
             after insert or update of raw_app_meta_data on auth.users
             for each row execute function public.handle_new_user()';
  raise notice 'gatilho on_auth_user_created recriado em auth.users';
end $$;
`;

console.log("\n==> Recriando o gatilho on_auth_user_created (não vem no dump do public)");
{
  const r = docker(
    ["exec", "-i", "-e", `DEST=${DESTINO}`, DB, "sh", "-c", 'psql "$DEST" -v ON_ERROR_STOP=1 -f -'],
    { input: TRIGGER_SQL },
  );
  const saidaGatilho = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (r.status !== 0) {
    console.log(`    ! falhou: ${saidaGatilho.split("\n")[0]}`);
    console.log("      Rode scripts/021_fix_profile_trigger.sql no destino para corrigir.");
  } else if (saidaGatilho) {
    console.log(`    ${saidaGatilho.split("\n").filter((l) => l.includes("NOTICE")).join("\n    ")}`);
  }
}

const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
console.log(
  `\n==> Enviado: ${kb(PUBLIC_DUMP)} public` + (SEM_LOGINS ? "" : `, ${kb(AUTH_DUMP)} auth`) + `, de ${BACKUP_DIR}`,
);

console.log(`
==> Próximos passos no projeto de homologação

1) Painel > Authentication > Hooks > Customize Access Token → public.custom_access_token_hook
   Sem isso o token não traz app_role/tenant_id e ninguém entra.

2) Confira o retrato lá (SQL Editor) e compare com o de cima:
   select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
     from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;

3) Aplique as migrations da Fase 6, uma por uma, conferindo entre elas:
   pnpm db:sql:homolog scripts/019_fix_missing_rls.sql
   pnpm db:sql:homolog scripts/020_vendor_policies.sql
   pnpm db:sql:homolog scripts/016_vendor_views.sql
   pnpm db:sql:homolog scripts/021_fix_profile_trigger.sql
   pnpm db:sql:homolog scripts/022_vendedor_por_pessoa.sql
${SEM_LOGINS ? "\n4) Crie os logins: scripts/manual/fase-2/seed-usuarios.mjs (não foram enviados)\n" : ""}
Os dumps em ${BACKUP_DIR} têm dados reais${SEM_LOGINS ? "" : " e hashes de senha"}. A pasta está no .gitignore.
`);
