// Roda SQL no clone LOCAL (container supabase_db_*). Nunca aceita URL externa: o alvo é fixo,
// 127.0.0.1 dentro do container.
//
// > Rodado à mão, por um humano. Nunca por um agente de IA (Fase 1 §1).
//
// Uso:
//   pnpm db:sql scripts/013_create_profiles.sql     # aplica um arquivo (para no 1º erro)
//   pnpm db:sql -c "select count(*) from sales"     # uma consulta
//   echo "select 1" | pnpm db:sql                   # pela entrada padrão

import { existsSync, readFileSync } from "node:fs";

import { LOCAL_URL, docker, fail, requireDbContainer } from "./docker-psql.mjs";

const repoRoot = new URL("../../", import.meta.url);
const container = requireDbContainer(repoRoot, { autoStart: false });
const args = process.argv.slice(2);

/** Roda o psql do container com os argumentos dados, repassando entrada e saída do terminal. */
const run = (psqlArgs, { input } = {}) => {
  const r = docker(
    ["exec", "-i", "-e", `LOCAL_URL=${LOCAL_URL}`, container, "sh", "-c", `psql "$LOCAL_URL" ${psqlArgs}`],
    input === undefined ? { stdio: ["inherit", "inherit", "inherit"] } : { input, stdio: ["pipe", "inherit", "inherit"] },
  );
  process.exit(r.status ?? 1);
};

if (args.length >= 1 && existsSync(args[0])) {
  console.log(`==> ${container} <- ${args[0]}`);
  run("-v ON_ERROR_STOP=1 -f -", { input: readFileSync(args[0], "utf8") });
} else if (args[0] === "-c") {
  if (args.length < 2) fail("falta o SQL depois do -c.");
  // O SQL vai por variável de ambiente para não precisar de escape de aspas.
  const r = docker(
    [
      "exec", "-i",
      "-e", `LOCAL_URL=${LOCAL_URL}`,
      "-e", `SQL=${args[1]}`,
      container,
      "sh", "-c", 'psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -c "$SQL"',
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  process.exit(r.status ?? 1);
} else if (args.length === 0) {
  run("-v ON_ERROR_STOP=1 -f -");
} else {
  fail(`não entendi os argumentos: ${args.join(" ")}
     Use: pnpm db:sql <arquivo.sql> | pnpm db:sql -c "<SQL>" | echo "<SQL>" | pnpm db:sql`);
}
