"""
import_from_railway_api.py
==========================
Calls the /admin/export endpoint on Railway (over HTTPS),
gets all users + AES-GCM re-encrypted passwords,
then inserts them all into Supabase.

Run AFTER the Railway app is redeployed with the export endpoint.
"""

import requests

RAILWAY_URL    = 'https://password-vault.up.railway.app'
MIGRATION_SECRET = 'vault-migrate-2024-secret'

SUPABASE_URL = 'https://cpjqyreptnlrcdczunjg.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwanF5cmVwdG5scmNkY3p1bmpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAzNDAxMywiZXhwIjoyMDk5NjEwMDEzfQ.smrmhUtz_5tpyiTTXqwSxPyIVtyyQbHvzrNokFRc5Rc'

SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal,resolution=ignore-duplicates',
}

def sb_upsert(table, data):
    r = requests.post(SUPABASE_URL + '/rest/v1/' + table, headers=SB_HEADERS, json=data, timeout=15)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(table + ': ' + str(r.status_code) + ' -> ' + r.text[:200])

def run():
    print('=' * 60)
    print('  Fetching data from Railway...')
    print('=' * 60)

    r = requests.get(
        RAILWAY_URL + '/admin/export',
        params={'secret': MIGRATION_SECRET},
        timeout=60
    )
    if r.status_code != 200:
        print('ERROR: Could not fetch export:', r.status_code, r.text[:300])
        return

    data = r.json()
    users     = data['users']
    passwords = data['passwords']
    meta      = data['meta']

    print('Users found    :', meta['user_count'])
    print('Passwords found:', meta['password_count'])

    print('\nInserting users into Supabase...')
    for i, u in enumerate(users, 1):
        sb_upsert('users', u)
        print('  [' + str(i) + '/' + str(len(users)) + '] ' + u['email'] + ' - OK')

    print('\nInserting passwords into Supabase...')
    errors = 0
    for i, p in enumerate(passwords, 1):
        try:
            sb_upsert('saved_passwords', p)
            print('  [' + str(i) + '/' + str(len(passwords)) + '] ' + p['account_name'] + ' - OK')
        except Exception as e:
            print('  [' + str(i) + '/' + str(len(passwords)) + '] ' + p['account_name'] + ' - FAILED: ' + str(e))
            errors += 1

    print('\n' + '=' * 60)
    print('  MIGRATION COMPLETE')
    print('  Users    :', len(users))
    print('  Passwords:', len(passwords) - errors, 'OK,', errors, 'errors')
    print('=' * 60)

if __name__ == '__main__':
    run()
