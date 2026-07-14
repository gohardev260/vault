// ============================================================
//  Vault — Cloudflare Worker
//  Full API backend: auth + password CRUD
//
//  Env vars (set via: wrangler secret put <NAME>):
//    JWT_SECRET       — same as your old JWT_SECRET
//    ENCRYPTION_KEY   — same as your old ENCRYPTION_KEY
//    SUPABASE_URL     — https://cpjqyreptnlrcdczunjg.supabase.co
//    SUPABASE_KEY     — your service_role key
//
//  ASSETS binding comes from wrangler.toml → serves the frontend
// ============================================================

import bcrypt from 'bcryptjs';

// ─── Response helpers ────────────────────────────────────────────────────────

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const err = (msg, status = 400) => json({ detail: msg }, status);

// ─── JWT (HS256 via WebCrypto — matches python-jose) ─────────────────────────

const b64u = (s) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const fromB64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
};

async function signJWT(userId, secret) {
  const header  = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 2592000, // 30 days
  }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function verifyJWT(token, secret) {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(fromB64u(s), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(`${h}.${p}`)
    );
    if (!valid) return null;
    const claims = JSON.parse(fromB64u(p));
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ─── AES-GCM encryption (key = SHA-256 of ENCRYPTION_KEY) ───────────────────

async function getAESKey(secret) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptPw(plain, secret) {
  const key = await getAESKey(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptPw(cipher, secret) {
  const key  = await getAESKey(secret);
  const data = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
  const iv   = data.slice(0, 12);
  const ct   = data.slice(12);
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// ─── Supabase REST client ─────────────────────────────────────────────────────

function db(env) {
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const h = {
    apikey:        env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type':  'application/json',
    Prefer:          'return=representation',
  };

  const chk = async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };

  return {
    get:    (t, qs = '')    => fetch(`${base}/${t}?${qs}`, { headers: h }).then(chk),
    post:   (t, body)       => fetch(`${base}/${t}`, { method: 'POST',   headers: h, body: JSON.stringify(body) }).then(chk),
    patch:  (t, qs, body)   => fetch(`${base}/${t}?${qs}`, { method: 'PATCH',  headers: h, body: JSON.stringify(body) }).then(chk),
    delete: (t, qs)         => fetch(`${base}/${t}?${qs}`, { method: 'DELETE', headers: h }).then(chk),
  };
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function getCurrentUser(request, env) {
  let token = null;
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    if (m) token = m[1];
  }
  if (!token) return null;

  const claims = await verifyJWT(token, env.JWT_SECRET);
  if (!claims?.sub) return null;

  const rows = await db(env).get('users', `id=eq.${claims.sub}&limit=1`);
  return rows[0] ?? null;
}

function setCookieHeader(token) {
  return `access_token=${token}; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000; Path=/`;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function register(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('Email and password required');

  const existing = await db(env).get('users', `email=eq.${encodeURIComponent(email)}&limit=1`);
  if (existing.length > 0) return err('Email already registered', 400);

  const password_hash = await bcrypt.hash(password, 10);
  const users = await db(env).post('users', { email, password_hash });
  const token = await signJWT(users[0].id, env.JWT_SECRET);

  return new Response(JSON.stringify({ message: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) },
  });
}

async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('Email and password required');

  const users = await db(env).get('users', `email=eq.${encodeURIComponent(email)}&limit=1`);
  if (users.length === 0) return err('Invalid credentials', 401);

  const valid = await bcrypt.compare(password, users[0].password_hash);
  if (!valid) return err('Invalid credentials', 401);

  const token = await signJWT(users[0].id, env.JWT_SECRET);
  return new Response(JSON.stringify({ message: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) },
  });
}

function logout() {
  return new Response(JSON.stringify({ message: 'ok' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'access_token=; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Path=/',
    },
  });
}

async function me(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);
  return json({ email: user.email });
}

async function listPasswords(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const rows = await db(env).get(
    'saved_passwords',
    `user_id=eq.${user.id}&order=is_pinned.desc,created_at.desc`
  );

  const out = [];
  for (const r of rows) {
    let pw = '';
    try { pw = await decryptPw(r.encrypted_password, env.ENCRYPTION_KEY); } catch {}
    out.push({
      id:           r.id,
      account_name: r.account_name,
      username:     r.username || '',
      password:     pw,
      created_at:   r.created_at || '',
      updated_at:   r.updated_at || '',
      is_pinned:    r.is_pinned,
    });
  }
  return json(out);
}

async function createPassword(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const { account_name, username = '', password, is_pinned = false } = await req.json();
  if (!account_name || !password) return err('account_name and password are required');

  const encrypted_password = await encryptPw(password, env.ENCRYPTION_KEY);
  const rows = await db(env).post('saved_passwords', {
    user_id: user.id, account_name, username, encrypted_password, is_pinned,
  });
  return json({ id: rows[0].id, message: 'saved' });
}

async function updatePassword(req, env, pid) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const existing = await db(env).get('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}&limit=1`);
  if (existing.length === 0) return err('Not found', 404);

  const body = await req.json();
  const updates = {};
  if (body.account_name !== undefined) updates.account_name = body.account_name;
  if (body.username     !== undefined) updates.username     = body.username;
  if (body.is_pinned    !== undefined) updates.is_pinned    = body.is_pinned;
  if (body.password     !== undefined) updates.encrypted_password = await encryptPw(body.password, env.ENCRYPTION_KEY);

  await db(env).patch('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}`, updates);
  return json({ message: 'updated' });
}

async function deletePassword(req, env, pid) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const existing = await db(env).get('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}&limit=1`);
  if (existing.length === 0) return err('Not found', 404);

  await db(env).delete('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}`);
  return json({ message: 'deleted' });
}

async function changePassword(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const { current_password, new_password } = await req.json();
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return err('Current password is wrong', 400);

  const new_hash = await bcrypt.hash(new_password, 10);
  await db(env).patch('users', `id=eq.${user.id}`, { password_hash: new_hash });
  return json({ message: 'changed' });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') return new Response(null, { status: 204 });

    // API routing
    if (pathname.startsWith('/api/')) {
      try {
        if (pathname === '/api/auth/register'           && method === 'POST')   return register(request, env);
        if (pathname === '/api/auth/login'              && method === 'POST')   return login(request, env);
        if (pathname === '/api/auth/logout'             && method === 'POST')   return logout();
        if (pathname === '/api/auth/me'                 && method === 'GET')    return me(request, env);
        if (pathname === '/api/passwords'               && method === 'GET')    return listPasswords(request, env);
        if (pathname === '/api/passwords'               && method === 'POST')   return createPassword(request, env);
        if (pathname === '/api/settings/change-password' && method === 'POST') return changePassword(request, env);

        const m = pathname.match(/^\/api\/passwords\/([^/]+)$/);
        if (m && method === 'PUT')    return updatePassword(request, env, m[1]);
        if (m && method === 'DELETE') return deletePassword(request, env, m[1]);

        return json({ detail: 'Not found' }, 404);
      } catch (e) {
        console.error(e);
        return json({ detail: e.message }, 500);
      }
    }

    // Serve static frontend
    return env.ASSETS.fetch(request);
  },
};
