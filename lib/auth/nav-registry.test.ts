import { describe, expect, it } from "vitest";
import { permissionsForRole, type Permission } from "./permissions";
import {
  COMPANY_SUBTABS,
  canOpenSettings,
  companySubTabs,
  resolveTab,
  topLevelTabs,
} from "./nav-registry";

// Fase 2 §5 "Permissões e navegação" / Fase 3 fatia 3.4. O bloqueio por aba (§3.5, N11) é do
// registro; a proteção real continua sendo o RLS.

const companies = [
  { code: "A", name: "Clock Society" },
  { code: "B", name: "The Secret" },
  { code: "C", name: "Morfeus" },
];
const admin = permissionsForRole("admin");
// Papel fictício: só vê Vendas e Estoque.
const fictitious: Permission[] = ["sales.view", "inventory.view"];

describe("nav-registry", () => {
  it("A-PERM-04 — para o admin, gera exatamente as abas de hoje, na mesma ordem", () => {
    // Fase 6 (6.7): o admin ganha a aba Usuários depois de Contratos (planejamento, Anexo C).
    expect(topLevelTabs(companies, admin).map((t) => t.label)).toEqual([
      "Clock Society",
      "The Secret",
      "Morfeus",
      "Contratos",
      "Usuários",
    ]);
    expect(topLevelTabs(companies, admin).map((t) => t.value)).toEqual(["A", "B", "C", "contracts", "users"]);
    expect(companySubTabs(admin).map((t) => [t.value, t.label])).toEqual([
      ["dashboard", "Dashboard"],
      ["vendas", "Vendas"],
      ["estoque", "Estoque"],
      ["custos-fixos", "Custos"],
    ]);
  });

  it("A-PERM-05 — papel sem a permissão da aba não recebe a aba na navegação", () => {
    expect(companySubTabs(fictitious).map((t) => t.value)).toEqual(["vendas", "estoque"]);
    expect(topLevelTabs(companies, fictitious).map((t) => t.value)).toEqual(["A", "B", "C"]);
  });

  it("A-PERM-05 — ?tab= apontando para aba não permitida resolve para acesso negado", () => {
    expect(resolveTab("custos-fixos", COMPANY_SUBTABS, fictitious)).toEqual({ kind: "denied" });
    expect(resolveTab("dashboard", COMPANY_SUBTABS, fictitious)).toEqual({ kind: "denied" });
    expect(resolveTab("vendas", COMPANY_SUBTABS, fictitious)).toEqual({ kind: "tab", value: "vendas" });
  });

  it("A-PERM-05 — ?company= apontando para aba não permitida (Contratos) resolve para acesso negado", () => {
    const entries = topLevelTabs(companies, admin);
    expect(resolveTab("contracts", entries, fictitious)).toEqual({ kind: "denied" });
    expect(resolveTab("B", entries, fictitious)).toEqual({ kind: "tab", value: "B" });
    expect(resolveTab("contracts", entries, admin)).toEqual({ kind: "tab", value: "contracts" });
  });

  it("sem valor na URL, ou valor desconhecido, resolve para a primeira aba permitida", () => {
    expect(resolveTab(null, COMPANY_SUBTABS, admin)).toEqual({ kind: "tab", value: "dashboard" });
    expect(resolveTab(null, COMPANY_SUBTABS, fictitious)).toEqual({ kind: "tab", value: "vendas" });
    expect(resolveTab("inexistente", COMPANY_SUBTABS, admin)).toEqual({ kind: "tab", value: "dashboard" });
    expect(resolveTab(null, COMPANY_SUBTABS, [])).toEqual({ kind: "denied" });
  });

  it("V-UI-09 — a aba Usuários exige users.manage; ?company=users sem a permissão → acesso negado", () => {
    const semUsuarios = admin.filter((p) => p !== "users.manage");
    expect(topLevelTabs(companies, semUsuarios).map((t) => t.value)).not.toContain("users");
    expect(resolveTab("users", topLevelTabs(companies, admin), semUsuarios)).toEqual({ kind: "denied" });
  });

  it("A-PERM-06 — o botão Configurações depende de salespersons.manage", () => {
    expect(canOpenSettings(admin)).toBe(true);
    expect(canOpenSettings(fictitious)).toBe(false);
    expect(canOpenSettings(["salespersons.manage"])).toBe(true);
  });
});

// Fase 5 §5 / Fase 6 fatia 6.8. Navegação do vendedor (planejamento, Anexo C).
describe("vendedor (Fase 6)", () => {
  it.todo("V-UI-01 — para o vendedor, as abas de cada empresa são Vendas, Comissões e Estoque, nessa ordem, sem Dashboard");
  it.todo("V-UI-01 — o vendedor não recebe as abas Contratos nem Usuários, nem o botão Configurações");
  it.todo("V-MW-03 — ?tab=custos-fixos e ?company=contracts resolvem para acesso negado para o vendedor");
  it.todo("V-UI-02 — empresas do seletor = só as empresas em que o vendedor atua (vínculos)");
});
