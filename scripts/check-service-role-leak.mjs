// V-API-06 (Fase 6, fatia 6.5): depois do `next build`, nenhum arquivo servido ao navegador
// (.next/static) pode conter a chave de serviço nem o nome da variável. Roda no CI, sem banco.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function findServiceRoleLeaks(staticDir) {
  const needles = ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  const leaks = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const content = readFileSync(full, "utf8");
        if (needles.some((n) => content.includes(n))) leaks.push(full);
      }
    }
  };
  walk(staticDir);
  return leaks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const leaks = findServiceRoleLeaks(join(process.cwd(), ".next", "static"));
  if (leaks.length > 0) {
    console.error("Chave de serviço encontrada em arquivos do navegador:\n" + leaks.join("\n"));
    process.exit(1);
  }
  console.log("OK: nenhuma menção à chave de serviço em .next/static");
}
