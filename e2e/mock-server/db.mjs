// Carrega e recarrega o estado em memória a partir dos fixtures JSON (§4).
// Nunca toca um banco de dados real — é só um objeto JS reconstruído do disco.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");

const TABLE_FILES = {
  companies: "companies.json",
  salespersons: "salespersons.json",
  sales: "sales.json",
  sale_items: "sale_items.json",
  sale_salespersons: "sale_salespersons.json",
  sale_costs: "sale_costs.json",
  fixed_costs: "fixed_costs.json",
  contracts: "contracts.json",
  inventory: "inventory.json",
  // Fase 6: perfis e vínculos como tabelas — escritas (ex.: limpar must_change_password) aparecem
  // nas claims do próximo token, como no hook real.
  profiles: "profiles.json",
  profile_salespersons: "profile_salespersons.json",
};

function loadJson(filename) {
  const raw = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return JSON.parse(raw);
}

export function loadUsers() {
  return loadJson("users.json");
}

// Perfis (Fase 3): fonte das claims do "hook" e da queda para profiles no RLS emulado.
export function loadProfiles() {
  return loadJson("profiles.json");
}

// Retorna um novo estado de tabelas, sempre lido do disco (nunca reaproveitado
// entre chamadas), para que cada reset comece de um estado conhecido.
export function freshTables() {
  const tables = {};
  for (const [table, file] of Object.entries(TABLE_FILES)) {
    tables[table] = structuredClone(loadJson(file));
  }
  return tables;
}
