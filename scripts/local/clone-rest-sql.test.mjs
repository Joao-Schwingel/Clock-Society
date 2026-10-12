// Testes do gerador de SQL do clone por REST. Função pura: não abre rede nem banco (Fase 1 §1).
import { describe, expect, it } from "vitest";

import {
  AUTH_TOKEN_COLUMNS, AUTH_USER_VALUES, buildLoadSql, dollarQuote, quoteLiteral,
} from "./clone-rest-sql.mjs";

const AUTH_COLS = new Set([
  "instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
  "confirmed_at", "created_at", "updated_at", "last_sign_in_at", "phone", "banned_until",
  "raw_app_meta_data", "raw_user_meta_data", "is_sso_user", "is_anonymous",
  ...AUTH_TOKEN_COLUMNS,
]);
const IDENTITY_COLS = new Set([
  "id", "user_id", "provider_id", "identity_data", "provider", "last_sign_in_at", "created_at",
  "updated_at",
]);

const user = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@exemplo.com",
  phone: "",
  created_at: "2026-01-02T03:04:05Z",
  updated_at: "2026-01-02T03:04:05Z",
  email_confirmed_at: "2026-01-02T03:04:05Z",
  app_metadata: { app_role: "admin", tenant_id: "11111111-1111-1111-1111-111111111111" },
  user_metadata: {},
};

describe("quoteLiteral", () => {
  it("escapa aspas simples", () => {
    expect(quoteLiteral("D'Ávila")).toBe("'D''Ávila'");
  });

  it("vira NULL para nulo, indefinido e string vazia", () => {
    // phone = "" em dois usuários colidiria no índice único de auth.users.
    expect(quoteLiteral(null)).toBe("null");
    expect(quoteLiteral(undefined)).toBe("null");
    expect(quoteLiteral("")).toBe("null");
  });

  it("não interpreta barra invertida (standard_conforming_strings)", () => {
    expect(quoteLiteral("c:\\temp")).toBe("'c:\\temp'");
  });
});

describe("dollarQuote", () => {
  it("usa a tag padrão quando não há conflito", () => {
    expect(dollarQuote('[{"a":1}]')).toBe('$cs$[{"a":1}]$cs$');
  });

  it("troca a tag quando o conteúdo tem a tag dentro", () => {
    const payload = '[{"nota":"preço $cs$ promocional"}]';
    const quoted = dollarQuote(payload);
    expect(quoted).toBe(`$csx$${payload}$csx$`);
    // a tag escolhida não pode aparecer no conteúdo, senão o literal fecha antes do fim
    expect(payload.includes("$csx$")).toBe(false);
  });
});

describe("buildLoadSql", () => {
  const base = { users: [], authCols: AUTH_COLS, identityCols: IDENTITY_COLS, password: "clone-local" };

  it("desliga gatilhos e FKs antes da carga, numa transação só", () => {
    const { sql } = buildLoadSql(base);
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql).toContain("set local session_replication_role = replica;");
    expect(sql).toContain("set local search_path = public, extensions;");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("insere auth.users só com as colunas que o GoTrue local tem", () => {
    const { sql } = buildLoadSql({ ...base, users: [user] });
    const cols = /insert into auth\.users \(([^)]+)\)/.exec(sql)[1].split(", ");
    expect(cols).toContain("encrypted_password");
    expect(cols).toContain("raw_app_meta_data");
    // confirmed_at é coluna GERADA no auth: inserir nela quebra
    expect(cols).not.toContain("confirmed_at");
    for (const col of cols) expect(AUTH_COLS.has(col)).toBe(true);
  });

  it("preenche com '' as colunas de token, nunca NULL", () => {
    // NULL aqui derruba o login com 500 "Database error querying schema": o GoTrue lê essas
    // colunas como string não-nula em Go.
    const { sql } = buildLoadSql({ ...base, users: [user] });
    const cols = /insert into auth\.users \(([^)]+)\)/.exec(sql)[1].split(", ");
    for (const token of AUTH_TOKEN_COLUMNS) expect(cols).toContain(token);
    for (const token of AUTH_TOKEN_COLUMNS) expect(AUTH_USER_VALUES[token]()).toBe("''");
  });

  it("não inventa coluna de token que a versão local não tem", () => {
    const semReauth = new Set([...AUTH_COLS].filter((c) => c !== "reauthentication_token"));
    const { sql } = buildLoadSql({ ...base, users: [user], authCols: semReauth });
    const cols = /insert into auth\.users \(([^)]+)\)/.exec(sql)[1].split(", ");
    expect(cols).not.toContain("reauthentication_token");
    expect(cols).toContain("confirmation_token");
  });

  it("pula colunas de auth.users que esta versão não tem", () => {
    const antigo = new Set([...AUTH_COLS].filter((c) => c !== "banned_until" && c !== "phone"));
    const { sql } = buildLoadSql({ ...base, users: [user], authCols: antigo });
    const cols = /insert into auth\.users \(([^)]+)\)/.exec(sql)[1].split(", ");
    expect(cols).not.toContain("banned_until");
    expect(cols).not.toContain("phone");
    expect(cols).toContain("email");
  });

  it("preserva o id de produção e aplica a senha de teste via crypt", () => {
    const { sql } = buildLoadSql({ ...base, users: [user], password: "senha-de-teste" });
    expect(sql).toContain(`'${user.id}'`);
    expect(sql).toContain("crypt('senha-de-teste', gen_salt('bf'))");
    // o hash real não vem pela API, então nada de encrypted_password vindo de produção
    expect(sql).not.toContain("$2a$");
  });

  it("copia app_metadata (as claims app_role/tenant_id) como jsonb", () => {
    const { sql } = buildLoadSql({ ...base, users: [user] });
    expect(sql).toContain(`${JSON.stringify(user.app_metadata)}$cs$::jsonb`);
  });

  it("cria a identidade de e-mail quando o schema é o novo", () => {
    const { sql } = buildLoadSql({ ...base, users: [user] });
    expect(sql).toContain("insert into auth.identities (id, user_id, provider_id");
    expect(sql).toContain("'email'");
  });

  it("não tenta auth.identities no formato antigo", () => {
    const { sql } = buildLoadSql({ ...base, users: [user], identityCols: new Set(["id", "user_id"]) });
    expect(sql).not.toContain("insert into auth.identities");
    expect(sql).toContain("insert into auth.users");
  });

  it("não gera insert nenhum de auth quando produção não tem usuário", () => {
    const { sql } = buildLoadSql(base);
    expect(sql).not.toContain("insert into auth.");
  });

  it("carrega só as colunas que existem nos dois lados", () => {
    const { sql, perTable } = buildLoadSql({
      ...base,
      tables: [
        {
          name: "sales",
          rows: [{ id: "a", total_price: 10, coluna_nova_em_producao: "x" }],
          prodCols: new Set(["id", "total_price", "coluna_nova_em_producao"]),
          localCols: new Set(["id", "total_price", "entry_value"]),
        },
      ],
    });
    expect(sql).toContain('insert into public.sales ("id", "total_price")');
    expect(sql).toContain('select "id", "total_price" from json_populate_recordset(null::public.sales,');
    // entry_value só existe no clone: fica com o default da migration
    const cols = /insert into public\.sales \(([^)]+)\)/.exec(sql)[1];
    expect(cols).not.toContain("entry_value");
    expect(cols).not.toContain("coluna_nova_em_producao");
    expect(perTable[0].missingInLocal).toEqual(["coluna_nova_em_producao"]);
  });

  it("deixa fora a coluna GERADA que quem chama não listou como inserível", () => {
    // sale_items.total_price é `generated always as (quantity * unit_price) stored` na 011:
    // vem na API de produção, mas o insert quebra com "cannot insert a non-DEFAULT value".
    const { sql } = buildLoadSql({
      ...base,
      tables: [
        {
          name: "sale_items",
          rows: [{ id: "a", quantity: 2, unit_price: 500.5, total_price: 1001 }],
          prodCols: new Set(["id", "quantity", "unit_price", "total_price"]),
          localCols: new Set(["id", "quantity", "unit_price"]),
        },
      ],
    });
    expect(sql).toContain('insert into public.sale_items ("id", "quantity", "unit_price")');
    // o valor continua no JSON da linha (inofensivo); o que não pode é entrar na lista de colunas
    const cols = /insert into public\.sale_items \(([^)]+)\)/.exec(sql)[1];
    expect(cols).not.toContain("total_price");
  });

  it("deduz as colunas pelas linhas quando o OpenAPI não respondeu", () => {
    const { sql } = buildLoadSql({
      ...base,
      tables: [
        {
          name: "costs",
          rows: [{ id: "a", amount: 5 }],
          prodCols: null,
          localCols: new Set(["id", "amount"]),
        },
      ],
    });
    expect(sql).toContain('insert into public.costs ("id", "amount")');
  });

  it("não gera insert para tabela vazia", () => {
    const { sql, perTable } = buildLoadSql({
      ...base,
      tables: [{ name: "contracts", rows: [], prodCols: new Set(["id"]), localCols: new Set(["id"]) }],
    });
    expect(sql).not.toContain("insert into public.contracts");
    expect(perTable).toEqual([{ name: "contracts", used: [], missingInLocal: [] }]);
  });

  it("serializa a linha inteira como JSON, sem montar valores à mão", () => {
    const rows = [{ id: "a", notes: "cliente disse 'oi'; drop pendente" }];
    const { sql } = buildLoadSql({
      ...base,
      tables: [{ name: "sales", rows, prodCols: new Set(["id", "notes"]), localCols: new Set(["id", "notes"]) }],
    });
    // o conteúdo vai dentro do dollar-quoting, como JSON — sem escape manual de aspas
    expect(sql).toContain(JSON.stringify(rows));
  });

  it("AUTH_USER_VALUES fixa aud e role como authenticated", () => {
    expect(AUTH_USER_VALUES.aud()).toBe("'authenticated'");
    expect(AUTH_USER_VALUES.role()).toBe("'authenticated'");
  });
});
