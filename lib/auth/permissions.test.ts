import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, permissionsForRole } from "./permissions";

// Fase 2 §5 "Permissões e navegação" / Fase 3 fatia 3.4.
// Nenhum destes testes abre conexão com banco (Fase 1 §1): o A-PERM-01 lê o SQL de seed de
// role_permissions como TEXTO e compara com o catálogo do front.

function seededRolePermissions(): Array<[string, string]> {
  const sql = readFileSync(join(process.cwd(), "scripts", "013_create_profiles.sql"), "utf8");
  const insert = sql.match(/insert into public\.role_permissions[\s\S]*?;/i);
  if (!insert) throw new Error("insert em role_permissions não encontrado na 013");
  return [...insert[0].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => [m[1], m[2]]);
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
    expect(PERMISSIONS).toHaveLength(11);
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
  it.todo("users.manage entra no catálogo (só admin) e nas linhas de role_permissions da migration da Fase 6");
});
