import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, permissionsForRole } from "./permissions";

// Fase 2 §5 "Permissões e navegação" / Fase 3 fatia 3.4.
// Nenhum destes testes abre conexão com banco (Fase 1 §1): o A-PERM-01 lê o SQL de seed de
// role_permissions como TEXTO e compara com o catálogo do front.

// Todas as linhas inseridas em role_permissions pelas migrations numeradas (013 em diante).
function seededRolePermissions(): Array<[string, string]> {
  const dir = join(process.cwd(), "scripts");
  const rows: Array<[string, string]> = [];
  for (const file of readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const insert of sql.matchAll(/insert into public\.role_permissions[\s\S]*?;/gi)) {
      rows.push(...[...insert[0].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => [m[1], m[2]] as [string, string]));
    }
  }
  if (rows.length === 0) throw new Error("nenhum insert em role_permissions nas migrations");
  return rows;
}

describe("catálogo de permissões", () => {
  it("A-PERM-01 — o catálogo do front é igual às linhas de role_permissions do SQL de seed (parse estático, sem conexão)", () => {
    const fromSql = seededRolePermissions()
      .map(([role, permission]) => `${role}:${permission}`)
      .sort();
    const fromFront = Object.entries(ROLE_PERMISSIONS)
      .flatMap(([role, perms]) => perms.map((p) => `${role}:${p}`))
      .sort();

    expect(fromSql.length).toBeGreaterThan(0);
    expect(fromFront).toEqual(fromSql);
  });

  it("A-PERM-02 — o papel admin tem todas as permissões do catálogo", () => {
    expect([...permissionsForRole("admin")].sort()).toEqual([...PERMISSIONS].sort());
    // 11 da Fase 3 + users.manage (Fase 6, fatia 6.7)
    expect(PERMISSIONS).toHaveLength(12);
  });

  it("papel desconhecido ou ausente não tem permissão nenhuma (nega por padrão)", () => {
    expect(permissionsForRole(null)).toEqual([]);
    expect(permissionsForRole("gerente")).toEqual([]);
    expect(hasPermission(permissionsForRole(undefined), "sales.view")).toBe(false);
  });

  it("vendedor ainda não tem permissões na Fase 3 (D-6)", () => {
    expect(permissionsForRole("vendedor")).toEqual([]);
  });
});

// Fase 5 §5 / Fase 6 fatia 6.2. Quando estes casos virarem testes, o caso "vendedor ainda não tem
// permissões na Fase 3" acima é substituído (docs/fase-5/README.md, "Testes da Fase 3 que mudam").
describe("vendedor (Fase 6)", () => {
  it.todo(
    "V-UI-01 — o vendedor tem commissions.view, sales.view e inventory.view, e nenhuma das demais (sales.export conforme Q4, issue #13)",
  );
  it.todo("V-UI-04 — o vendedor não tem sales.view_costs nem sales.write");
  it.todo("V-UI-07 — o vendedor não tem inventory.write");
  it.todo("V-MW-03 — o vendedor não tem fixed_costs.manage, contracts.manage, salespersons.manage nem users.manage");
  it("V-UI-09 — users.manage está no catálogo e é só do admin (seed na migration 020)", () => {
    expect(PERMISSIONS).toContain("users.manage");
    expect(permissionsForRole("admin")).toContain("users.manage");
    expect(permissionsForRole("vendedor")).not.toContain("users.manage");
  });
});
