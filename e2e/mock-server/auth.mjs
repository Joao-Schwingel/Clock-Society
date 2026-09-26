// Emula só o suficiente do GoTrue (Supabase Auth) para signInWithPassword,
// getUser e signOut — o bastante para @supabase/auth-js e @supabase/ssr
// funcionarem sem saber que não há um Supabase real do outro lado.

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

function decodeFakeToken(token) {
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

export function signInWithPassword(users, email, password) {
  const user = users.find((u) => u.email === email && u.password === password);
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

  const expiresIn = 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const accessToken = makeFakeAccessToken({
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    exp: expiresAt,
  });

  return {
    status: 200,
    body: {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: expiresAt,
      refresh_token: `refresh-${user.id}-${Date.now()}`,
      user: toGoTrueUser(user),
    },
  };
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
