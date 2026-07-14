#!/usr/bin/env python3
"""
migrate_railway_job.py
======================
This script runs INSIDE Railway (as a one-off deploy) so it has access
to the internal database. It reads all data, re-encrypts passwords,
and pushes everything to Supabase via HTTPS.

HOW TO USE:
  1. Push this file to your repo (git add + git commit + git push)
  2. In Railway dashboard → your vault service → Settings → Deploy
     change the Start Command temporarily to:
       python migration/migrate_railway_job.py
  3. Redeploy once — watch the logs for the migration output
  4. After success, revert the Start Command back to your original
"""

import os
import sys
import base64
import hashlib
import requests
import psycopg2
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ── Config (all from Railway env vars — no hardcoding needed) ─────────────────
DATABASE_URL   = os.environ['DATABASE_URL']          # auto-injected by Railway
ENCRYPTION_KEY = os.environ.get(
    'ENCRYPTION_KEY',
    'e0bd5023732d3fce7cd3f03bf0c4f64b4ad3abd8bb09769aafce28e0654788a0'
)
SUPABASE_URL = 'https://cpjqyreptnlrcdczunjg.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwanF5cmVwdG5scmNkY3p1bmpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAzNDAxMywiZXhwIjoyMDk5NjEwMDEzfQ.smrmhUtz_5tpyiTTXqwSxPyIVtyyQbHvzrNokFRc5Rc'

if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

# ── Encryption ────────────────────────────────────────────────────────────────
_fernet_key = base64.urlsafe_b64encode(hashlib.sha256(ENCRYPTION_KEY.encode()).digest())
fernet       = Fernet(_fernet_key)
_aes_key     = hashlib.sha256(ENCRYPTION_KEY.encode()).digest()
aesgcm       = AESGCM(_aes_key)

def decrypt_fernet(c): return fernet.decrypt(c.encode()).decode()

def encrypt_aesgcm(p):
    iv = os.urandom(12)
    ct = aesgcm.encrypt(iv, p.encode(), None)
    return base64.b64encode(iv + ct).decode()

# ── Supabase ──────────────────────────────────────────────────────────────────
SB = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal,resolution=ignore-duplicates',
}

def sb_upsert(table, data):
    r = requests.post(f'{SUPABASE_URL}/rest/v1/{table}', headers=SB, json=data, timeout=15)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f'{table}: {r.status_code} -> {r.text[:200]}')

# ── Migration ─────────────────────────────────────────────────────────────────
def migrate():
    print('=' * 60)
    print('  VAULT MIGRATION: Railway -> Supabase')
    print('=' * 60)

    print('\n[1/4] Connecting to Railway internal database...')
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    print('[2/4] Reading users...')
    cur.execute('SELECT id, email, password_hash, created_at FROM users')
    users = cur.fetchall()
    print(f'      Found {len(users)} user(s)')

    print('[3/4] Reading saved passwords...')
    cur.execute('''
        SELECT id, user_id, account_name, username,
               encrypted_password, is_pinned, created_at, updated_at
        FROM saved_passwords
    ''')
    passwords = cur.fetchall()
    print(f'      Found {len(passwords)} password(s)')
    conn.close()

    print('\n[4/4] Migrating to Supabase...')
    print('  Users:')
    for i, (uid, email, pw_hash, created_at) in enumerate(users, 1):
        sb_upsert('users', {
            'id': str(uid), 'email': email, 'password_hash': pw_hash,
            'created_at': created_at.isoformat() if created_at else None,
        })
        print(f'    [{i}/{len(users)}] {email} - OK')

    print('  Passwords:')
    errors = 0
    for i, (pid, uid, name, username, enc_pw, pinned, cat, uat) in enumerate(passwords, 1):
        try:
            plain      = decrypt_fernet(enc_pw)
            new_cipher = encrypt_aesgcm(plain)
            sb_upsert('saved_passwords', {
                'id': str(pid), 'user_id': str(uid),
                'account_name': name, 'username': username or '',
                'encrypted_password': new_cipher, 'is_pinned': bool(pinned),
                'created_at': cat.isoformat() if cat else None,
                'updated_at': uat.isoformat() if uat else None,
            })
            print(f'    [{i}/{len(passwords)}] {name} - OK')
        except Exception as e:
            print(f'    [{i}/{len(passwords)}] {name} - FAILED: {e}')
            errors += 1

    print('\n' + '=' * 60)
    print('  MIGRATION COMPLETE')
    print(f'  Users:     {len(users)} migrated')
    print(f'  Passwords: {len(passwords) - errors} migrated, {errors} errors')
    print('=' * 60)

if __name__ == '__main__':
    migrate()
