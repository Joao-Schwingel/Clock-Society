// Testes de BANCO do modelo de vendedor e do vínculo com login (Fase 6 + migration 022).
//
// Roda contra um Postgres LOCAL descartável, subido e apagado por este script — NÃO contra o clone
// de produção: os dados são sintéticos, para o resultado ser determinístico e não sujar os reais.
//
// A espinha do teste é o ORÁCULO da 022: tira a foto dos números por empresa ANTES da migração,
// aplica, e exige que a foto DEPOIS seja idêntica. Se a fusão de cadastros mexer em um centavo,
// o teste acusa. Depois ainda ensaia o rollback.
//
// Uso:  pnpm db:test:vinculo

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { docker } from "../docker-psql.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CT = "clock-society-teste-vinculo";
const URL_IN = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const BASE = [
  "scripts/001_create_tables.sql", "scripts/003_add_salesperson.sql", "scripts/004_create_contracts.sql",
  "scripts/005_create_sale_costs.sql", "scripts/005_migrate_contracts.sql", "scripts/006_add_sale_status.sql",
  "scripts/007_create_fixed_costs.sql", "scripts/008_create_salespersons.sql",
  "scripts/009_seed_site_salesperson.sql", "scripts/011_reconcile_schema.sql",
  "scripts/views/sales_with_details.sql", "scripts/views/sales_with_salespersons.sql",
  "scripts/views/salesperson_summary.sql",
];
const FASE_3 = [
  "scripts/013_create_profiles.sql", "scripts/014_auth_helpers.sql", "scripts/015_rewrite_policies.sql",
  "scripts/017_indexes.sql", "scripts/018_backfill_admin.sql",
];
const FASE_6 = [
  "scripts/019_fix_missing_rls.sql", "scripts/020_vendor_policies.sql", "scripts/016_vendor_views.sql",
  "scripts/021_fix_profile_trigger.sql",
];

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const P_CARLA = "33333333-3333-3333-3333-333333333333";
const P_BRUNO = "44444444-4444-4444-4444-444444444444";
const EMPRESA_A = "aaaaaaaa-0000-0000-0000-000000000001";
const EMPRESA_B = "aaaaaaaa-0000-0000-0000-000000000002";
const EMPRESA_C = "aaaaaaaa-0000-0000-0000-000000000003";
const SP_CARLA_A = "bbbbbbbb-0000-0000-0000-000000000001";
const SP_CARLA_B = "bbbbbbbb-0000-0000-0000-000000000002"; // a MESMA pessoa, na empresa B
const SP_BRUNO_A = "bbbbbbbb-0000-0000-0000-000000000003";
const SP_OUTRO_C = "bbbbbbbb-0000-0000-0000-000000000005";
const VENDA_A = "cccccccc-0000-0000-0000-000000000001";
const VENDA_B = "cccccccc-0000-0000-0000-000000000002";

// ------------------------------------------------------------------------------- utilitários
const run = (texto) => {
  const r = docker(["exec", "-i", "-e", `U=${URL_IN}`, CT, "sh", "-c", 'psql "$U" -v ON_ERROR_STOP=1 -Atq -f -'], {
    input: texto,
  });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};

const sql = (texto) => {
  const r = run(texto);
  if (!r.ok) throw new Error(`SQL falhou:\n${texto}\n--\n${r.err}`);
  return r.out;
};

const comoUsuario = (profileId, appRole, tenantId, query) =>
  run(`begin;
set local role authenticated;
set local request.jwt.claims = '${JSON.stringify({
    sub: profileId,
    role: "authenticated",
    app_metadata: { app_role: appRole, tenant_id: tenantId },
  })}';
${query}
rollback;`);

const resultados = [];
const checar = (id, descricao, condicao, detalhe = "") =>
  resultados.push({ id, descricao, ok: Boolean(condicao), detalhe });
const lacuna = (id, descricao, atual, explicacao) =>
  resultados.push({ id, descricao, ok: Boolean(atual), lacuna: true, detalhe: explicacao });

function esperaRecusa(id, descricao, comando, padrao) {
  const r = run(comando);
  const casou = !r.ok && padrao.test(r.err);
  checar(id, descricao, casou,
    r.ok ? "foi ACEITO (devia recusar)" : casou ? "" : `recusou por outro motivo: ${r.err.split("\n")[0]}`);
}

/**
 * Números por empresa, do jeito que o app os mostra — é o oráculo da migração.
 * Roda como o ADMIN: commission_summary() é security definer com guarda e exige as claims.
 */
const foto = (empresa) => {
  const r = comoUsuario(
    T1,
    "admin",
    T1,
    `select string_agg(salesperson_name || '|' || sales_count || '|' || total_sales || '|' ||
                       total_costs || '|' || coalesce(total_commission::text, 'null'), ';' order by salesperson_name)
       from public.commission_summary('${empresa}', 2026, array[3]);`,
  );
  if (!r.ok) throw new Error(`foto da empresa ${empresa} falhou:\n${r.err}`);
  return r.out.trim();
};

// ------------------------------------------------------------------- 1. banco descartável
console.log("==> Subindo Postgres descartável (dados sintéticos; o clone não é tocado)");
docker(["rm", "-f", "-v", CT]);
if (docker(["run", "-d", "--name", CT, "-e", "POSTGRES_PASSWORD=postgres", "postgres:17-alpine"]).status !== 0) {
  console.error("não consegui subir o container de teste (o Docker está rodando?)");
  process.exit(1);
}
if (docker(["exec", "-i", CT, "sh", "-c",
  "for i in $(seq 1 60); do pg_isready -q -U postgres && exit 0; sleep 1; done; exit 1"]).status !== 0) {
  console.error("o Postgres de teste não subiu");
  process.exit(1);
}

sql(`
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit bypassrls;
create role supabase_auth_admin noinherit;
grant anon, authenticated, service_role, supabase_auth_admin to postgres;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key, email text unique,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb $f$;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
`);

const aplicar = (lista) => {
  for (const arquivo of lista) {
    const r = run(readFileSync(`${REPO_ROOT}${arquivo}`, "utf8"));
    if (!r.ok) {
      console.error(`\n[falhou] ${arquivo}\n${r.err}`);
      docker(["rm", "-f", "-v", CT]);
      process.exit(1);
    }
    console.log(`    ok ${arquivo}`);
  }
};

console.log("==> Migrations base");
aplicar(BASE);

// ----------------------------------- 2. cenário no modelo ANTIGO (um cadastro por empresa)
sql(`
insert into auth.users (id, email) values
  ('${T1}', 'admin1@teste'), ('${T2}', 'admin2@teste'),
  ('${P_CARLA}', 'carla@teste'), ('${P_BRUNO}', 'bruno@teste');

insert into public.companies (id, name, code, user_id) values
  ('${EMPRESA_A}', 'Empresa A', 'A', '${T1}'),
  ('${EMPRESA_B}', 'Empresa B', 'B', '${T1}'),
  ('${EMPRESA_C}', 'Empresa C', 'C', '${T2}');

insert into public.salespersons (id, user_id, company_id, name, commission_percentage, is_active) values
  ('${SP_CARLA_A}', '${T1}', '${EMPRESA_A}', 'Carla', 5, true),
  ('${SP_CARLA_B}', '${T1}', '${EMPRESA_B}', 'Carla', 7, true),
  ('${SP_BRUNO_A}', '${T1}', '${EMPRESA_A}', 'Bruno', 3, true),
  ('${SP_OUTRO_C}', '${T2}', '${EMPRESA_C}', 'Outro', 9, true);

insert into public.sales (id, company_id, user_id, product_name, quantity, unit_price, total_price,
                          sale_date, order_number, status) values
  ('${VENDA_A}', '${EMPRESA_A}', '${T1}', 'Relógio A', 1, 1000, 1000, '2026-03-10', 1, 'concluída'),
  ('${VENDA_B}', '${EMPRESA_B}', '${T1}', 'Relógio B', 1,  500,  500, '2026-03-11', 2, 'concluída');

-- percentual da VENDA, propositalmente diferente do cadastro: é ele que manda
insert into public.sale_salespersons (sale_id, salesperson_id, commission_percent) values
  ('${VENDA_A}', '${SP_CARLA_A}', 5),
  ('${VENDA_A}', '${SP_BRUNO_A}', 3),
  ('${VENDA_B}', '${SP_CARLA_B}', 42);

insert into public.sale_costs (sale_id, user_id, cost_type, description, amount) values
  ('${VENDA_A}', '${T1}', 'transporte', 'frete', 200);
`);

console.log("==> Migrations da Fase 3 e da Fase 6");
aplicar(FASE_3);
aplicar(FASE_6);

sql(`
insert into public.profiles (id, tenant_id, role, full_name) values
  ('${P_CARLA}', '${T1}', 'vendedor', 'Carla'),
  ('${P_BRUNO}', '${T1}', 'vendedor', 'Bruno')
on conflict (id) do nothing;
-- modelo antigo: o login da Carla apontava para os DOIS cadastros dela
insert into public.profile_salespersons (profile_id, salesperson_id) values
  ('${P_CARLA}', '${SP_CARLA_A}'), ('${P_CARLA}', '${SP_CARLA_B}'), ('${P_BRUNO}', '${SP_BRUNO_A}');
`);

// ------------------------------------------------------- 3. FOTO ANTES (oráculo da 022)
const antesA = foto(EMPRESA_A);
const antesB = foto(EMPRESA_B);
const antesVendas = sql("select count(*) || '/' || sum(commission_percent) from public.sale_salespersons;");
const antesCadastros = sql("select count(*) from public.salespersons;");

// ------------------------------------------------------------------- 4. aplicar a 022
console.log("==> Migration 022 (vendedor vira pessoa com N empresas)");
aplicar(["scripts/022_vendedor_por_pessoa.sql"]);

console.log("==> Rodando os casos\n");

// ========================================================== 5. a migração preservou tudo?
checar("M-01", "os números da Empresa A são IDÊNTICOS antes e depois", foto(EMPRESA_A) === antesA,
  foto(EMPRESA_A) === antesA ? "" : `antes:\n${antesA}\ndepois:\n${foto(EMPRESA_A)}`);
checar("M-02", "os números da Empresa B são IDÊNTICOS antes e depois", foto(EMPRESA_B) === antesB,
  foto(EMPRESA_B) === antesB ? "" : `antes:\n${antesB}\ndepois:\n${foto(EMPRESA_B)}`);
checar("M-03", "sale_salespersons intacto: mesma contagem e mesmos percentuais",
  sql("select count(*) || '/' || sum(commission_percent) from public.sale_salespersons;") === antesVendas,
  `antes ${antesVendas}`);
checar("M-04", "os dois cadastros da Carla viraram um", sql(
  `select count(*) from public.salespersons where user_id = '${T1}' and lower(name) = 'carla';`) === "1",
  `cadastros antes: ${antesCadastros}, depois: ${sql("select count(*) from public.salespersons;")}`);
checar("M-05", "a pessoa fundida tem acesso às DUAS empresas", sql(
  `select count(*) from public.salesperson_companies sc
     join public.salespersons sp on sp.id = sc.salesperson_id
    where lower(sp.name) = 'carla';`) === "2");
const sumiram = Number(antesCadastros) - Number(sql("select count(*) from public.salespersons;"));
checar("M-06", "o mapa de fusão guardou todos os cadastros removidos (insumo do rollback)",
  sql("select count(*) from public.salespersons_merge_map;") === String(sumiram),
  `sumiram ${sumiram}, no mapa ${sql("select count(*) from public.salespersons_merge_map;")}`);
checar("M-07", "o login da Carla aponta para a pessoa (1:1)", sql(
  `select count(*) from public.salespersons where profile_id = '${P_CARLA}';`) === "1");
checar("M-08", "profile_salespersons não existe mais",
  sql("select coalesce(to_regclass('public.profile_salespersons')::text, 'nao');") === "nao");
checar("M-09", "salespersons não tem mais company_id nem commission_percentage", sql(
  `select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'salespersons'
      and column_name in ('company_id', 'commission_percentage');`) === "0");

// ============================================================ 6. regras do modelo novo
esperaRecusa("M-10", "uma pessoa não pode ter dois logins",
  `update public.salespersons set profile_id = '${P_BRUNO}'
     where id = (select id from public.salespersons where lower(name) = 'carla');`,
  /salespersons_profile_id_key|unique/i);

esperaRecusa("M-11", "o mesmo acesso não entra duas vezes",
  `insert into public.salesperson_companies (salesperson_id, company_id)
     select id, '${EMPRESA_A}' from public.salespersons where lower(name) = 'carla';`,
  /salesperson_companies_pkey|duplicate key/i);

const r12 = run(`insert into public.salesperson_companies (salesperson_id, company_id)
  select id, '${EMPRESA_C}' from public.salespersons where lower(name) = 'carla';`);
lacuna("M-12", "dar acesso a empresa de OUTRO inquilino: o banco ainda aceita", r12.ok,
  "mesma lacuna de antes (V-LINK-05): a tabela de acessos não tem constraint de inquilino. " +
  "Quem barra é companiesInTenant() em lib/users/service.ts.");
if (r12.ok) {
  sql(`delete from public.salesperson_companies sc
        using public.salespersons sp
        where sp.id = sc.salesperson_id and lower(sp.name) = 'carla' and sc.company_id = '${EMPRESA_C}';`);
}

// ======================================================= 7. o que o vendedor enxerga
const ids = comoUsuario(P_CARLA, "vendedor", T1, "select count(*) from public.my_salesperson_ids();");
checar("M-13", "my_salesperson_ids(): uma pessoa", ids.out.trim().endsWith("1"), ids.out.trim());

const empresas = comoUsuario(P_CARLA, "vendedor", T1, "select count(*) from public.my_company_ids();");
checar("M-14", "my_company_ids(): as duas empresas da pessoa", empresas.out.trim().endsWith("2"), empresas.out.trim());

const vendas = comoUsuario(P_CARLA, "vendedor", T1, "select count(*) from public.vendor_sales;");
checar("M-15", "vendor_sales traz as vendas das duas empresas", vendas.out.trim().endsWith("2"), vendas.out.trim());

const vendasBruno = comoUsuario(P_BRUNO, "vendedor", T1, "select count(*) from public.vendor_sales;");
checar("M-16", "o colega de uma empresa só vê a venda dela", vendasBruno.out.trim().endsWith("1"), vendasBruno.out.trim());

const comissao = comoUsuario(P_CARLA, "vendedor", T1,
  `select salesperson_name || '=' || coalesce(total_commission::text, 'null')
     from public.commission_summary('${EMPRESA_A}', 2026, array[3]) order by salesperson_name;`);
const linhas = comissao.out.split("\n").map((l) => l.trim()).filter((l) => l.includes("="));
checar("M-17", "commission_summary(): a do colega vem nula, a própria vem",
  linhas.some((l) => l.startsWith("Bruno=null")) && linhas.some((l) => /^Carla=(?!null)/.test(l)),
  linhas.join(" | ") || comissao.err.split("\n")[0]);
const valor = linhas.find((l) => l.startsWith("Carla="));
checar("M-18", "a comissão desconta os custos: (1000 − 200) × 5% = 40",
  Number((valor ?? "").split("=")[1]) === 40, valor ?? "");

const escrita = comoUsuario(P_CARLA, "vendedor", T1,
  `insert into public.salesperson_companies (salesperson_id, company_id)
     select id, '${EMPRESA_B}' from public.salespersons where lower(name) = 'carla';`);
checar("M-19", "o vendedor não escreve os próprios acessos", !escrita.ok, escrita.ok ? "ACEITOU a escrita" : "");

sql(`update public.profiles set is_active = false where id = '${P_CARLA}';`);
const inativa = comoUsuario(P_CARLA, "vendedor", T1, "select count(*) from public.my_company_ids();");
checar("M-20", "perfil desativado não enxerga empresa nenhuma", inativa.out.trim().endsWith("0"), inativa.out.trim());
sql(`update public.profiles set is_active = true where id = '${P_CARLA}';`);

// ================================================= 8. gatilho do "Site" no modelo novo
sql(`insert into public.companies (id, name, code, user_id)
     values ('aaaaaaaa-0000-0000-0000-000000000009', 'Empresa D', 'D', '${T1}');`);
checar("M-21", "nova empresa: o 'Site' do inquilino ganha ACESSO, sem cadastro novo",
  sql(`select count(*) from public.salespersons where user_id = '${T1}' and lower(name) = 'site';`) === "1" &&
  sql(`select count(*) from public.salesperson_companies sc join public.salespersons sp on sp.id = sc.salesperson_id
        where lower(sp.name) = 'site';`) === "4",
  sql(`select string_agg(t.linha, ' | ') from (
         select sp.user_id::text || ' -> ' || count(sc.company_id)::text || ' acesso(s)' as linha
           from public.salespersons sp
           left join public.salesperson_companies sc on sc.salesperson_id = sp.id
          where lower(sp.name) = 'site' group by sp.id, sp.user_id) t;`));

// ====================================== 8b. o mapa de fusão não é do app (achado em 23/10/2026)
// Tabela nova no `public` nasce com os privilégios padrão do Supabase — `authenticated` com
// select/insert/update/delete — e sem RLS. Sem o revoke da 022, um vendedor leria nomes e
// percentuais antigos de TODOS os inquilinos e poderia apagar o insumo do rollback.
checar("M-27", "salespersons_merge_map: RLS ligado e sem privilégio para anon/authenticated",
  sql(`select c.relrowsecurity::text from pg_class c where c.relname = 'salespersons_merge_map';`) === "true" &&
  sql(`select count(*) from information_schema.role_table_grants
        where table_name = 'salespersons_merge_map' and grantee in ('anon', 'authenticated');`) === "0");

// ============================================================= 9. ensaio do rollback
console.log("==> Ensaio do rollback da 022");
const r = run(readFileSync(`${REPO_ROOT}scripts/rollback/022_vendedor_por_pessoa.down.sql`, "utf8"));
checar("M-22", "o rollback da 022 roda sem erro", r.ok, r.ok ? "" : r.err.split("\n")[0]);
if (r.ok) {
  checar("M-23", "o rollback devolve os cadastros por empresa", sql(
    `select count(*) from public.salespersons where user_id = '${T1}' and lower(name) = 'carla';`) === "2");
  checar("M-24", "e os números voltam a bater com a foto original", foto(EMPRESA_A) === antesA,
    foto(EMPRESA_A) === antesA ? "" : `esperado:\n${antesA}\nobtido:\n${foto(EMPRESA_A)}`);

  // M-25 e M-26 pegam o defeito achado no ensaio com o clone de produção (23/10/2026): o rollback
  // devolvia o sobrevivente para a empresa de um duplicado, porque escolhia "o acesso mais antigo"
  // e a 022 cria todos eles com o mesmo created_at. Dava dois cadastros do mesmo nome na mesma
  // empresa, vendas apontando para vendedor de outra empresa, e a guarda (b) da 022 abortaria numa
  // segunda aplicação. A foto de uma empresa só (M-24) não acusava.
  const duplicados = sql(`select count(*) from (
      select name, company_id from public.salespersons group by 1, 2 having count(*) > 1) d;`);
  checar("M-25", "o rollback não deixa dois cadastros do mesmo nome na mesma empresa",
    duplicados.trim() === "0", duplicados.trim() === "0" ? "" : `${duplicados.trim()} par(es) duplicado(s)`);

  const cruzadas = sql(`select count(*) from public.sale_salespersons ss
      join public.sales s on s.id = ss.sale_id
      join public.salespersons sp on sp.id = ss.salesperson_id
     where s.company_id <> sp.company_id;`);
  checar("M-26", "e nenhuma venda fica com vendedor de outra empresa (guarda (b) da 022)",
    cruzadas.trim() === "0", cruzadas.trim() === "0" ? "" : `${cruzadas.trim()} venda(s) cruzada(s)`);
}

// ------------------------------------------------------------------------------- relatório
const rotulo = (x) => (x.lacuna ? (x.ok ? "LACUNA" : "MUDOU") : x.ok ? "OK" : "FALHA");
console.log(`\n${"ID".padEnd(7)}${"".padEnd(8)}descrição`);
for (const x of resultados) {
  console.log(`${x.id.padEnd(7)}${rotulo(x).padEnd(8)}${x.descricao}${x.detalhe ? `\n${"".padEnd(15)}↳ ${x.detalhe}` : ""}`);
}
const falhas = resultados.filter((x) => !x.ok);
const lacunas = resultados.filter((x) => x.lacuna && x.ok);
console.log(`\n${falhas.length === 0 ? "TUDO OK" : `${falhas.length} FALHA(S)`} — ${resultados.length} casos` +
  (lacunas.length ? `, ${lacunas.length} lacuna(s) conhecida(s)` : ""));

docker(["rm", "-f", "-v", CT]);
console.log("banco de teste removido");
process.exit(falhas.length === 0 ? 0 : 1);
