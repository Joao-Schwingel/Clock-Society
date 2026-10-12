// Roda um arquivo SQL no projeto de HOMOLOGAÇÃO, usando o psql de dentro do container local
// (assim não é preciso instalar cliente Postgres na máquina).
//
// > Rodado à mão, por um humano. Nunca em CI, nunca por um agente de IA.
// > Nunca aponta para produção: a trava de homolog.mjs recusa o projeto do .env.
//
// Uso:
//   $env:HOMOLOG_DB_URL="postgresql://postgres.<ref>:<senha>@aws-1-<regiao>.pooler.supabase.com:5432/postgres"
//   pnpm db:sql:homolog scripts/019_fix_missing_rls.sql
//   pnpm db:sql:homolog -c "select count(*) from public.salespersons"

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { docker, fail, requireDbContainer } from "./docker-psql.mjs";
import { alvoHomolog, exigeHumano, urlResumida } from "./homolog.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

exigeHumano();
const DESTINO = alvoHomolog();
const DB = requireDbContainer(REPO_ROOT, { autoStart: false });
const args = process.argv.slice(2);

const rodar = (psqlArgs, input) => {
  const r = docker(
    ["exec", "-i", "-e", `DEST=${DESTINO}`, DB, "sh", "-c", `psql "$DEST" ${psqlArgs}`],
    input === undefined ? { stdio: ["ignore", "inherit", "inherit"] } : { input, stdio: ["pipe", "inherit", "inherit"] },
  );
  process.exit(r.status ?? 1);
};

if (args.length >= 1 && existsSync(args[0])) {
  console.log(`==> ${urlResumida(DESTINO)} <- ${args[0]}`);
  rodar("-v ON_ERROR_STOP=1 -f -", readFileSync(args[0], "utf8"));
} else if (args[0] === "-c") {
  if (args.length < 2) fail("falta o SQL depois do -c.");
  const r = docker(
    ["exec", "-i", "-e", `DEST=${DESTINO}`, "-e", `SQL=${args[1]}`, DB, "sh", "-c",
      'psql "$DEST" -v ON_ERROR_STOP=1 -c "$SQL"'],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  process.exit(r.status ?? 1);
} else {
  fail(`informe um arquivo ou uma consulta.
     pnpm db:sql:homolog <arquivo.sql>
     pnpm db:sql:homolog -c "<SQL>"`);
}
