import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fase 5 §5 / Fase 6 fatia 6.5 — V-API-06. Sem servidor e sem banco: lê arquivos como texto.

const ROOT = process.cwd();
const SERVER_ONLY_MODULES = ["lib/supabase/admin", "lib/users/supabase-repo"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

describe("chave service_role", () => {
  it("V-API-06 — os módulos com a chave de serviço começam com `import \"server-only\"`", () => {
    for (const mod of SERVER_ONLY_MODULES) {
      expect(readFileSync(join(ROOT, `${mod}.ts`), "utf8")).toMatch(/^import "server-only";/m);
    }
  });

  it("V-API-06 — nenhum arquivo \"use client\" importa esses módulos", () => {
    const offenders = ["app", "components", "hooks", "lib"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return /^["']use client["']/m.test(src) && SERVER_ONLY_MODULES.some((m) => src.includes(`@/${m}`));
      });
    expect(offenders).toEqual([]);
  });

  // Roda no CI depois do `next build` (scripts/check-service-role-leak.mjs). Localmente, só se houver build.
  it.skipIf(!existsSync(join(ROOT, ".next", "static")))(
    "V-API-06 — nenhum arquivo em .next/static menciona a chave de serviço",
    async () => {
      const { findServiceRoleLeaks } = await import("../../scripts/check-service-role-leak.mjs");
      expect(findServiceRoleLeaks(join(ROOT, ".next", "static"))).toEqual([]);
    },
  );
});
