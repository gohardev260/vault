import requests

SUPABASE_URL = 'https://cpjqyreptnlrcdczunjg.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwanF5cmVwdG5scmNkY3p1bmpnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAzNDAxMywiZXhwIjoyMDk5NjEwMDEzfQ.smrmhUtz_5tpyiTTXqwSxPyIVtyyQbHvzrNokFRc5Rc'

h = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
}

users = requests.get(SUPABASE_URL + '/rest/v1/users?select=id,email&limit=100', headers=h).json()
pws   = requests.get(SUPABASE_URL + '/rest/v1/saved_passwords?select=id&limit=1000', headers=h).json()

print('Users in Supabase    :', len(users))
print('Passwords in Supabase:', len(pws))
for u in users:
    print('  -', u['email'])
