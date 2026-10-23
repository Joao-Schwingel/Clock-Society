// Geração do SQL de carga do clone por REST (scripts/local/clonar-producao-rest.mjs).
//
// Função pura, sem rede e sem banco, para poder ser testada: recebe o que foi lido de produção e
// as colunas que existem no banco local, devolve o SQL. Testes em clone-rest-sql.test.mjs.

/** Literal de texto para SQL. `''` e nulo/indefinido viram NULL (phone = "" colidiria no índice único). */
export const quoteLiteral = (value) =>
  value === null || value === undefined || value === ""
    ? "null"
    : `'${String(value).replace(/'/g, "''")}'`;

/** Dollar-quoting com tag que não aparece no conteúdo. */
export const dollarQuote = (text) => {
  let tag = "cs";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
};

/**
 * Colunas de token de auth.users que o GoTrue lê como string NÃO-NULA (Go): com NULL, o login
 * falha com 500 "Database error querying schema" e, no log do container,
 * "Scan error on column ... converting NULL to string is unsupported".
 * O Supabase sempre grava '' nelas, então o clone faz o mesmo.
 */
export const AUTH_TOKEN_COLUMNS = [
  "confirmation_token",
  "recovery_token",
  "email_change",
  "email_change_token_new",
  "email_change_token_current",
  "phone_change",
  "phone_change_token",
  "reauthentication_token",
];

/**
 * Colunas de auth.users que o clone preenche, na ordem. O script usa só as que existem no GoTrue
 * local (a interseção), porque o schema do auth muda entre versões.
 */
export const AUTH_USER_VALUES = {
  ...Object.fromEntries(AUTH_TOKEN_COLUMNS.map((col) => [col, () => "''"])),
  instance_id: () => "'00000000-0000-0000-0000-000000000000'",
  id: (u) => quoteLiteral(u.id),
  aud: () => "'authenticated'",
  role: () => "'authenticated'",
  email: (u) => quoteLiteral(u.email),
  // O hash real não vem pela API: todos os logins ficam com a mesma senha de teste.
  encrypted_password: (_u, password) => `crypt(${quoteLiteral(password)}, gen_salt('bf'))`,
  email_confirmed_at: (u) => (u.email_confirmed_at ? quoteLiteral(u.email_confirmed_at) : "now()"),
  created_at: (u) => (u.created_at ? quoteLiteral(u.created_at) : "now()"),
  updated_at: (u) => (u.updated_at ? quoteLiteral(u.updated_at) : "now()"),
  last_sign_in_at: (u) => quoteLiteral(u.last_sign_in_at),
  phone: (u) => quoteLiteral(u.phone),
  banned_until: (u) => quoteLiteral(u.banned_until),
  raw_app_meta_data: (u) => `${dollarQuote(JSON.stringify(u.app_metadata ?? {}))}::jsonb`,
  raw_user_meta_data: (u) => `${dollarQuote(JSON.stringify(u.user_metadata ?? {}))}::jsonb`,
};

/**
 * @param {object}   args
 * @param {object[]} args.users         usuários da Auth Admin API de produção
 * @param {Set}      args.authCols      colunas de auth.users no banco local
 * @param {Set}      args.identityCols  colunas de auth.identities no banco local
 * @param {{name: string, rows: object[], prodCols: Set|null, localCols: Set}[]} args.tables
 *        localCols = colunas da tabela local que ACEITAM insert. Coluna GERADA (como
 *        sale_items.total_price, na 011) vem na API de produção e não pode entrar no insert,
 *        então quem chama já a deixa de fora.
 * @param {string}   args.password       senha de teste dos logins do clone
 * @returns {{sql: string, perTable: {name: string, used: string[], missingInLocal: string[]}[]}}
 */
export function buildLoadSql({ users = [], authCols, identityCols, tables = [], password }) {
  const sql = [
    "begin;",
    // crypt()/gen_salt() ficam no schema extensions num projeto Supabase.
    "set local search_path = public, extensions;",
    // replica desliga TODO gatilho, inclusive os de FK e o create_site_salesperson_trigger da
    // 009: a carga entra exatamente como está em produção, sem efeito colateral e sem depender
    // da ordem das tabelas.
    "set local session_replication_role = replica;",
    "create extension if not exists pgcrypto;",
  ];

  const authUse = Object.keys(AUTH_USER_VALUES).filter((c) => authCols.has(c));
  if (users.length > 0) {
    sql.push(
      `insert into auth.users (${authUse.join(", ")}) values\n` +
        users
          .map((u) => `  (${authUse.map((c) => AUTH_USER_VALUES[c](u, password)).join(", ")})`)
          .join(",\n") +
        ";",
    );

    // identities: só no formato novo do GoTrue. Login por e-mail/senha não depende dessa linha.
    if (identityCols.has("provider_id") && identityCols.has("identity_data")) {
      const cols = ["user_id", "provider_id", "identity_data", "provider", "created_at", "updated_at"];
      if (identityCols.has("id")) cols.unshift("id");
      sql.push(
        `insert into auth.identities (${cols.join(", ")}) values\n` +
          users
            .map((u) => {
              const value = {
                id: "gen_random_uuid()",
                user_id: quoteLiteral(u.id),
                provider_id: quoteLiteral(u.id),
                identity_data: `${dollarQuote(
                  JSON.stringify({ sub: u.id, email: u.email, email_verified: true }),
                )}::jsonb`,
                provider: "'email'",
                created_at: u.created_at ? quoteLiteral(u.created_at) : "now()",
                updated_at: u.updated_at ? quoteLiteral(u.updated_at) : "now()",
              };
              return `  (${cols.map((c) => value[c]).join(", ")})`;
            })
            .join(",\n") +
          ";",
      );
    }
  }

  // Tabelas do public: só as colunas que existem nos DOIS lados. Coluna que só existe no clone
  // fica com o default da migration; coluna que só existe em produção é relatada (dado perdido).
  const perTable = [];
  for (const { name, rows, prodCols, localCols } of tables) {
    if (rows.length === 0) {
      perTable.push({ name, used: [], missingInLocal: [] });
      continue;
    }
    const prod = prodCols ?? new Set(Object.keys(rows[0]));
    const used = [...prod].filter((c) => localCols.has(c));
    const missingInLocal = [...prod].filter((c) => !localCols.has(c));
    perTable.push({ name, used, missingInLocal });

    const list = used.map((c) => `"${c}"`).join(", ");
    sql.push(
      `insert into public.${name} (${list})\n` +
        `select ${list} from json_populate_recordset(null::public.${name}, ${dollarQuote(
          JSON.stringify(rows),
        )});`,
    );
  }

  sql.push("commit;");
  return { sql: sql.join("\n\n") + "\n", perTable };
}
