// Helpers comuns dos scripts de clone local: achar o container do Postgres do Supabase local e
// rodar SQL dentro dele. Em Node, e não em shell, porque no PowerShell `bash` é o do WSL
// (C:\Windows\System32\bash.exe) e falha com "execvpe(/bin/bash) failed" quando não há distro.
//
// Nada aqui aceita URL de fora: o alvo de escrita é sempre o Postgres local, visto de dentro do
// próprio container.

import { spawnSync } from "node:child_process";

export const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

export const fail = (msg) => {
  console.error(`\n[abortado] ${msg}\n`);
  process.exit(1);
};

export const docker = (args, opts = {}) =>
  spawnSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });

export function requireDocker() {
  if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) {
    fail("Docker não está rodando. Abra o Docker Desktop e repita.");
  }
}

export const findDbContainer = () =>
  docker(["ps", "--filter", "name=supabase_db_", "--filter", "status=running", "--format", "{{.Names}}"])
    .stdout.trim()
    .split(/\r?\n/)[0] || "";

/** Sobe o stack local se o container não estiver de pé. Devolve o nome do container. */
export function requireDbContainer(repoRoot, { autoStart = true } = {}) {
  requireDocker();
  let container = findDbContainer();
  if (!container && autoStart) {
    console.log("==> Subindo o Supabase local (supabase start)...");
    const started = spawnSync("pnpm", ["exec", "supabase", "start"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (started.status !== 0) fail("supabase start falhou.");
    container = findDbContainer();
  }
  if (!container) {
    fail(
      autoStart
        ? "não achei o container do Postgres local (supabase_db_*)."
        : "o Supabase local não está de pé. Rode: pnpm db:local",
    );
  }
  return container;
}

/**
 * Roda SQL no banco local pela entrada padrão do psql do container.
 * @param {string}  container nome do container
 * @param {string}  sql
 * @param {object}  [options]
 * @param {boolean} [options.raw]   true devolve a saída formatada do psql; false, só os valores (-Atq)
 * @param {boolean} [options.throwOnError] false devolve a saída mesmo com erro, sem abortar
 */
export function psql(container, sql, { raw = false, throwOnError = true } = {}) {
  const cmd = `psql "$LOCAL_URL" -v ON_ERROR_STOP=1 ${raw ? "" : "-Atq"} -f -`;
  const r = docker(["exec", "-i", "-e", `LOCAL_URL=${LOCAL_URL}`, container, "sh", "-c", cmd], {
    input: sql,
  });
  if (r.status !== 0 && throwOnError) fail(`psql falhou:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

export const psqlList = (container, sql) =>
  psql(container, sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** Quantas tabelas o schema public do banco local tem. 0 = banco limpo, pronto para um clone. */
export const publicTableCount = (container) =>
  Number(psqlList(container, "select count(*) from pg_tables where schemaname = 'public';")[0] || "0");

/** Contagem de linhas de cada tabela do public (e de auth.users/identities), para o retrato. */
export const RETRATO_SQL = `select table_schema || '.' || table_name as tabela,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::bigint as linhas
  from information_schema.tables
 where (table_schema = 'public' and table_type = 'BASE TABLE')
    or (table_schema = 'auth' and table_name in ('users', 'identities'))
 order by 1;`;
