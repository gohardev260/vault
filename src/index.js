// ============================================================
//  Vault — Cloudflare Worker (Supabase Auth Edition)
//  Full API backend: auth via Supabase Auth + password CRUD
//
//  Env vars (set via: wrangler secret put <NAME>):
//    ENCRYPTION_KEY   — used for Vault AES-GCM encryption
//    SUPABASE_URL     — https://cpjqyreptnlrcdczunjg.supabase.co
//    SUPABASE_KEY     — your service_role key (bypasses RLS)
//
//  ASSETS binding comes from wrangler.toml → serves the frontend
// ============================================================

// ─── Response helpers ────────────────────────────────────────────────────────

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const err = (msg, status = 400) => json({ detail: msg }, status);

// ─── AES-GCM encryption (key = SHA-256 of ENCRYPTION_KEY) ───────────────────

async function getAESKey(secret) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptPw(plain, secret) {
  const key = await getAESKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...out));
}

async function decryptPw(cipher, secret) {
  const key = await getAESKey(secret);
  const data = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// ─── Supabase REST & Auth client ─────────────────────────────────────────────

function supabase(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL secret is missing. Please set it using: npx wrangler secret put SUPABASE_URL");
  }
  if (!env.SUPABASE_KEY) {
    throw new Error("SUPABASE_KEY secret is missing. Please set it using: npx wrangler secret put SUPABASE_KEY");
  }

  // Ensure URL has a protocol
  const url = env.SUPABASE_URL.startsWith('http') ? env.SUPABASE_URL : `https://${env.SUPABASE_URL}`;
  const restBase = `${url}/rest/v1`;
  const authBase = `${url}/auth/v1`;

  const commonHeaders = {
    apikey: env.SUPABASE_KEY,
    'Content-Type': 'application/json',
  };

  const serviceHeaders = {
    ...commonHeaders,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
  };

  const chk = async (r) => {
    if (!r.ok) {
      const info = await r.json().catch(() => ({ error_description: null, msg: null, error: null }));
      const msg = info.error_description || info.msg || info.error || `Request failed with status ${r.status}`;
      throw new Error(msg);
    }
    return r.status === 204 ? null : r.json();
  };

  return {
    // Database requests (using service role to bypass RLS)
    db: {
      get: (t, qs = '') => fetch(`${restBase}/${t}?${qs}`, { headers: serviceHeaders }).then(chk),
      post: (t, body) => fetch(`${restBase}/${t}`, { method: 'POST', headers: { ...serviceHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body) }).then(chk),
      patch: (t, qs, body) => fetch(`${restBase}/${t}?${qs}`, { method: 'PATCH', headers: { ...serviceHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body) }).then(chk),
      delete: (t, qs) => fetch(`${restBase}/${t}?${qs}`, { method: 'DELETE', headers: serviceHeaders }).then(chk),
    },
    // Auth endpoints (proxies email/password signup and login)
    auth: {
      signUp: (email, password) =>
        fetch(`${authBase}/signup`, {
          method: 'POST',
          headers: serviceHeaders,
          body: JSON.stringify({ email, password })
        }).then(chk),

      signIn: (email, password) =>
        fetch(`${authBase}/token?grant_type=password`, {
          method: 'POST',
          headers: serviceHeaders,
          body: JSON.stringify({ email, password })
        }).then(chk),

      getUser: (token) =>
        fetch(`${authBase}/user`, {
          method: 'GET',
          headers: {
            ...commonHeaders,
            Authorization: `Bearer ${token}`
          }
        }).then(chk),

      updateUser: (token, updates) =>
        fetch(`${authBase}/user`, {
          method: 'PUT',
          headers: {
            ...commonHeaders,
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(updates)
        }).then(chk),
    }
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

  try {
    const user = await supabase(env).auth.getUser(token);
    return { id: user.id, email: user.email, token };
  } catch (e) {
    console.error('User auth error:', e.message);
    return null;
  }
}

function setCookieHeader(token) {
  return `access_token=${token}; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000; Path=/`;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function register(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('Email and password required');

  try {
    const res = await supabase(env).auth.signUp(email, password);
    const token = res.access_token || res.session?.access_token;

    if (token) {
      return new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) },
      });
    }

    return json({ message: 'Confirmation email sent' });
  } catch (e) {
    console.error('Supabase SignUp Error:', e.message);
    return err(e.message);
  }
}

async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('Email and password required');

  try {
    const res = await supabase(env).auth.signIn(email, password);
    const token = res.access_token;
    return new Response(JSON.stringify({ message: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) },
    });
  } catch (e) {
    console.error('Supabase SignIn Error:', e.message);
    return err(e.message, 401);
  }
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

  try {
    const rows = await supabase(env).db.get(
      'saved_passwords',
      `user_id=eq.${user.id}&order=is_pinned.desc,created_at.desc`
    );

    const out = [];
    for (const r of rows) {
      let pw = '';
      try { pw = await decryptPw(r.encrypted_password, env.ENCRYPTION_KEY); } catch { }
      out.push({
        id: r.id,
        account_name: r.account_name,
        username: r.username || '',
        password: pw,
        created_at: r.created_at || '',
        updated_at: r.updated_at || '',
        is_pinned: r.is_pinned,
      });
    }
    return json(out);
  } catch (e) {
    return err(e.message);
  }
}

async function createPassword(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const { account_name, username = '', password, is_pinned = false } = await req.json();
  if (!account_name || !password) return err('account_name and password are required');

  try {
    const encrypted_password = await encryptPw(password, env.ENCRYPTION_KEY);
    const rows = await supabase(env).db.post('saved_passwords', {
      user_id: user.id, account_name, username, encrypted_password, is_pinned,
    });
    return json({ id: rows[0].id, message: 'saved' });
  } catch (e) {
    return err(e.message);
  }
}

async function updatePassword(req, env, pid) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  try {
    const existing = await supabase(env).db.get('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}&limit=1`);
    if (existing.length === 0) return err('Not found', 404);

    const body = await req.json();
    const updates = {};
    if (body.account_name !== undefined) updates.account_name = body.account_name;
    if (body.username !== undefined) updates.username = body.username;
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
    if (body.password !== undefined) updates.encrypted_password = await encryptPw(body.password, env.ENCRYPTION_KEY);

    await supabase(env).db.patch('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}`, updates);
    return json({ message: 'updated' });
  } catch (e) {
    return err(e.message);
  }
}

async function deletePassword(req, env, pid) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  try {
    const existing = await supabase(env).db.get('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}&limit=1`);
    if (existing.length === 0) return err('Not found', 404);

    await supabase(env).db.delete('saved_passwords', `id=eq.${pid}&user_id=eq.${user.id}`);
    return json({ message: 'deleted' });
  } catch (e) {
    return err(e.message);
  }
}

async function changePassword(req, env) {
  const user = await getCurrentUser(req, env);
  if (!user) return err('Not authenticated', 401);

  const { new_password } = await req.json();
  if (!new_password) return err('New password is required');

  try {
    // Supabase Auth handles changing the user password
    await supabase(env).auth.updateUser(user.token, { password: new_password });
    return json({ message: 'changed' });
  } catch (e) {
    return err(e.message);
  }
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
        if (pathname === '/api/auth/register' && method === 'POST') return register(request, env);
        if (pathname === '/api/auth/login' && method === 'POST') return login(request, env);
        if (pathname === '/api/auth/logout' && method === 'POST') return logout();
        if (pathname === '/api/auth/me' && method === 'GET') return me(request, env);
        if (pathname === '/api/passwords' && method === 'GET') return listPasswords(request, env);
        if (pathname === '/api/passwords' && method === 'POST') return createPassword(request, env);
        if (pathname === '/api/settings/change-password' && method === 'POST') return changePassword(request, env);

        const m = pathname.match(/^\/api\/passwords\/([^/]+)$/);
        if (m && method === 'PUT') return updatePassword(request, env, m[1]);
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
