import { randomUUID } from "node:crypto";

// Emula só o suficiente do GoTrue (Supabase Auth) para signInWithPassword,
// refresh de sessão, getUser e signOut — o bastante para @supabase/auth-js e
// @supabase/ssr funcionarem sem saber que não há um Supabase real do outro lado.
//
// Fase 3: emula também o custom access token hook (scripts/014_auth_helpers.sql):
// o access token leva app_metadata.app_role/tenant_id do perfil (e2e/fixtures/profiles.json);
// usuário sem perfil, ou inativo, recebe token sem essas claims. Como no Supabase real, o
// objeto devolvido por getUser() NÃO traz essas claims (N10) — só o JWT.

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Não precisa ser um JWT válido/assinado: nada aqui valida a assinatura, só o
// payload é decodificado pelo próprio auth-js para achar o "sub" e o "exp".
function makeFakeAccessToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  return `${base64url(header)}.${base64url(payload)}.mock-signature`;
}

export function decodeFakeToken(token) {
  try {
    const [, payloadB64] = token.split(".");
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function toGoTrueUser(fixtureUser) {
  return {
    id: fixtureUser.id,
    aud: "authenticated",
    role: "authenticated",
    email: fixtureUser.email,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// Claims que o hook injetaria para este usuário, ou null se ele não tem perfil ativo.
export function hookClaimsFor(profiles, userId) {
  const profile = profiles.find((p) => p.id === userId);
  if (!profile || !profile.is_active) return null;
  return {
    app_role: profile.role,
    tenant_id: profile.tenant_id,
    ...(profile.must_change_password ? { must_change_password: true } : {}),
  };
}

// `withClaims: false` simula um token emitido antes de o hook existir (A-MW-06).
function issueSession(user, profiles, { withClaims }) {
  const expiresIn = 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const hookClaims = withClaims ? hookClaimsFor(profiles, user.id) : null;
  const accessToken = makeFakeAccessToken({
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    exp: expiresAt,
    app_metadata: { provider: "email", providers: ["email"], ...(hookClaims ?? {}) },
  });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: expiresAt,
    refresh_token: `refresh-${user.id}-${Date.now()}`,
    user: toGoTrueUser(user),
  };
}

export function signInWithPassword(users, profiles, email, password, { legacyTokens = false } = {}) {
  const user = users.find((u) => u.email === email && u.password === password);
  if (user?.banned) {
    return { status: 400, body: { error: "invalid_grant", error_code: "user_banned", msg: "User is banned" } };
  }
  if (!user) {
    return {
      status: 400,
      body: {
        error: "invalid_grant",
        error_code: "invalid_credentials",
        error_description: "Invalid login credentials",
        msg: "Invalid login credentials",
      },
    };
  }
  return { status: 200, body: issueSession(user, profiles, { withClaims: !legacyTokens }) };
}

// Renovação sempre passa pelo hook — é assim que uma sessão antiga ganha as claims (A-MW-06).
export function refreshSession(users, profiles, refreshToken) {
  const match = /^refresh-(.+)-\d+$/.exec(refreshToken ?? "");
  const user = match && users.find((u) => u.id === match[1]);
  if (!user) {
    return {
      status: 400,
      body: { error: "invalid_grant", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" },
    };
  }
  return { status: 200, body: issueSession(user, profiles, { withClaims: true }) };
}

export function getUserFromToken(users, authorizationHeader) {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, body: { message: "Missing authorization" } };

  const payload = decodeFakeToken(token);
  if (!payload) return { status: 401, body: { message: "Invalid token" } };

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return { status: 401, body: { message: "Token expired" } };
  }

  const user = users.find((u) => u.id === payload.sub);
  if (!user) return { status: 401, body: { message: "User not found" } };

  return { status: 200, body: toGoTrueUser(user) };
}

// updateUser({ password }) do GoTrue. Senha igual à atual → 422 "same_password", como o real.
export function updateUserPassword(users, authorizationHeader, password) {
  const current = getUserFromToken(users, authorizationHeader);
  if (current.status !== 200) return current;
  const user = users.find((u) => u.id === current.body.id);
  if (password === user.password) {
    return {
      status: 422,
      body: { code: "same_password", error_code: "same_password", msg: "New password should be different from the old password." },
    };
  }
  user.password = password;
  return { status: 200, body: toGoTrueUser(user) };
}

// ── API administrativa do Auth (chave de serviço), usada por lib/users/supabase-repo.ts ──────────

export function adminListUsers(users) {
  return { status: 200, body: { users: users.map(toGoTrueUser), aud: "authenticated" } };
}

// Cria o login e emula o gatilho on_auth_user_created (013): perfil só com app_role + tenant_id.
export function adminCreateUser(users, tables, body) {
  const email = String(body.email ?? "").toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return {
      status: 422,
      body: { code: "email_exists", error_code: "email_exists", msg: "A user with this email address has already been registered" },
    };
  }
  const user = { id: randomUUID(), email, password: body.password };
  users.push(user);
  const meta = body.app_metadata ?? {};
  if (meta.app_role && meta.tenant_id) {
    const now = new Date().toISOString();
    tables.profiles.push({
      id: user.id,
      tenant_id: meta.tenant_id,
      role: meta.app_role,
      full_name: body.user_metadata?.full_name ?? null,
      is_active: true,
      must_change_password: false,
      created_at: now,
      updated_at: now,
    });
  }
  return { status: 200, body: toGoTrueUser(user) };
}

export function adminUpdateUser(users, id, body) {
  const user = users.find((u) => u.id === id);
  if (!user) return { status: 404, body: { msg: "User not found" } };
  if (typeof body.password === "string") user.password = body.password;
  if (typeof body.ban_duration === "string") user.banned = body.ban_duration !== "none";
  return { status: 200, body: toGoTrueUser(user) };
}

export function adminDeleteUser(users, tables, id) {
  const i = users.findIndex((u) => u.id === id);
  if (i === -1) return { status: 404, body: { msg: "User not found" } };
  users.splice(i, 1);
  // on delete cascade de profiles → auth.users
  tables.profiles = tables.profiles.filter((p) => p.id !== id);
  tables.profile_salespersons = tables.profile_salespersons.filter((l) => l.profile_id !== id);
  return { status: 200, body: {} };
}
