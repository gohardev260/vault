#!/usr/bin/env python3
"""
migrate.py — One-time data migration: Railway PostgreSQL → Supabase
============================================================
What this does:
  1. Connects to your OLD Railway PostgreSQL database
  2. Reads all users and saved passwords
  3. Decrypts each password (Python Fernet)
  4. Re-encrypts it with AES-GCM (matches the new Cloudflare Worker)
  5. Inserts everything into Supabase

BEFORE YOU RUN THIS:
  1. Enable the public URL for your Railway PostgreSQL:
       Railway → your PostgreSQL service → Settings → Networking → Generate Domain
     You'll get a URL like:
       postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:PORT/railway
     Paste it into RAILWAY_PUBLIC_URL below.

  2. Install dependencies:
       pip install psycopg2-binary cryptography requests

  3. Run:
       python migrate.py
"""

import os
import sys
import base64
import hashlib
import requests
import psycopg2
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ─── Configuration ────────────────────────────────────────────────────────────
# ⚠️  Replace the placeholder with your Railway PUBLIC database URL

# When run via `railway run`, Railway injects DATABASE_URL with the internal host.
# Fallback to the public URL for direct local use.
RAILWAY_PUBLIC_URL = (
    os.getenv('DATABASE_URL') or
    os.getenv('RAILWAY_PUBLIC_URL') or
    'postgresql://postgres:ABGSTEtcilKeGBEeUzYfLyQakupmGxDR@localhost:5433/railway'
)

ENCRYPTION_KEY  = 'e0bd5023732d3fce7cd3f03bf0c4f64b4ad3abd8bb09769aafce28e0654788a0'
SUPABASE_URL    = 'https://cpjqyreptnlrcdczunjg.supabase.co'
SUPABASE_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwanF5cmVwdG5scmNkY3p1bmpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAzNDAxMywiZXhwIjoyMDk5NjEwMDEzfQ.smrmhUtz_5tpyiTTXqwSxPyIVtyyQbHvzrNokFRc5Rc'

# ─── Encryption helpers ───────────────────────────────────────────────────────

# Old cipher: Python Fernet (key = base64url(sha256(ENCRYPTION_KEY)))
_fernet_key = base64.urlsafe_b64encode(hashlib.sha256(ENCRYPTION_KEY.encode()).digest())
fernet       = Fernet(_fernet_key)

# New cipher: AES-256-GCM (key = sha256(ENCRYPTION_KEY) raw bytes)
# This EXACTLY matches the Cloudflare Worker's getAESKey() function
_aes_key = hashlib.sha256(ENCRYPTION_KEY.encode()).digest()
aesgcm   = AESGCM(_aes_key)


def decrypt_fernet(cipher_text: str) -> str:
    """Decrypt a Fernet-encrypted string from the old Railway DB."""
    return fernet.decrypt(cipher_text.encode()).decode()


def encrypt_aesgcm(plaintext: str) -> str:
    """
    Encrypt using AES-256-GCM.
    Format: base64( iv[12] + ciphertext + auth_tag[16] )
    This matches the Worker's encryptPw() output exactly.
    """
    iv = os.urandom(12)
    ct = aesgcm.encrypt(iv, plaintext.encode(), None)  # ct already includes the 16-byte tag
    return base64.b64encode(iv + ct).decode()


# ─── Supabase REST client ─────────────────────────────────────────────────────

SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}


def sb_upsert(table: str, data: dict) -> None:
    """Insert a row into Supabase, ignore if already exists (idempotent)."""
    headers = {**SB_HEADERS, 'Prefer': 'return=minimal,resolution=ignore-duplicates'}
    r = requests.post(f'{SUPABASE_URL}/rest/v1/{table}', headers=headers, json=data, timeout=15)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f'Supabase error on {table}: {r.status_code} → {r.text[:300]}')


# ─── Main migration ───────────────────────────────────────────────────────────

def migrate():
    if 'REPLACE_WITH_PUBLIC_HOST' in RAILWAY_PUBLIC_URL:
        print('\n!  ERROR: You must set the Railway PUBLIC database URL first!')
        print('    1. Go to Railway -> PostgreSQL service -> Settings -> Networking -> Generate Domain')
        print('    2. Paste the resulting URL into RAILWAY_PUBLIC_URL in this script\n')
        sys.exit(1)

    print('=' * 60)
    print('  Vault Migration: Railway -> Supabase')
    print('=' * 60)

    # -- Connect to Railway --
    print('\n[1/4] Connecting to Railway database...')
    try:
        conn = psycopg2.connect(RAILWAY_PUBLIC_URL, sslmode='prefer', connect_timeout=15)
    except Exception as e:
        print(f'!  Could not connect to Railway: {e}')
        sys.exit(1)


    cur = conn.cursor()

    # -- Export users --
    print('[2/4] Exporting users...')
    cur.execute('SELECT id, email, password_hash, created_at FROM users')
    users = cur.fetchall()
    print(f'     Found {len(users)} user(s)')

    # -- Export saved passwords --
    print('[3/4] Exporting saved passwords...')
    cur.execute('''
        SELECT id, user_id, account_name, username,
               encrypted_password, is_pinned, created_at, updated_at
        FROM   saved_passwords
    ''')
    passwords = cur.fetchall()
    print(f'     Found {len(passwords)} saved password(s)')
    conn.close()

    # -- Insert users into Supabase --
    print('\n[4/4] Migrating to Supabase...')
    print('  -> Users:')
    for i, (uid, email, password_hash, created_at) in enumerate(users, 1):
        sb_upsert('users', {
            'id':            str(uid),
            'email':         email,
            'password_hash': password_hash,
            'created_at':    created_at.isoformat() if created_at else None,
        })
        print(f'     [{i}/{len(users)}] {email} OK')

    # -- Insert saved passwords into Supabase --
    print('  -> Passwords:')
    errors = 0
    for i, (pid, user_id, account_name, username,
            encrypted_password, is_pinned, created_at, updated_at) in enumerate(passwords, 1):
        try:
            # Step 1: Decrypt old Fernet ciphertext
            plain = decrypt_fernet(encrypted_password)

            # Step 2: Re-encrypt with AES-GCM (Worker-compatible format)
            new_cipher = encrypt_aesgcm(plain)

            # Step 3: Insert into Supabase
            sb_upsert('saved_passwords', {
                'id':                 str(pid),
                'user_id':            str(user_id),
                'account_name':       account_name,
                'username':           username or '',
                'encrypted_password': new_cipher,
                'is_pinned':          bool(is_pinned),
                'created_at':         created_at.isoformat() if created_at else None,
                'updated_at':         updated_at.isoformat() if updated_at else None,
            })
            print(f'     [{i}/{len(passwords)}] {account_name} OK')
        except Exception as e:
            print(f'     [{i}/{len(passwords)}] {account_name} FAILED: {e}')
            errors += 1

    # -- Summary --
    print('\n' + '=' * 60)
    print(f'  DONE! Migration complete!')
    print(f'      Users migrated    : {len(users)}')
    print(f'      Passwords migrated: {len(passwords) - errors}')
    if errors:
        print(f'      WARNINGS: {errors} error(s)  (check output above)')
    print('=' * 60 + '\n')


if __name__ == '__main__':
    migrate()
