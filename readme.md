# 🔐 Vault — Zero-Knowledge Password Manager

[![Security - Zero Knowledge](https://img.shields.io/badge/Security-Zero--Knowledge-000000?style=for-the-badge&logo=shield&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![Encryption - AES--256--GCM](https://img.shields.io/badge/Encryption-AES--256--GCM-green?style=for-the-badge&logo=lock&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)
[![Backend - Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Frontend - Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla_JS_%2B_Tailwind-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://tailwindcss.com)

**Vault** is a modern, lightweight, client-side zero-knowledge password manager. Designed with enterprise-grade cryptographic standards, Vault ensures that your master credentials and sensitive account data are encrypted locally before reaching the server. Neither database administrators nor external eavesdroppers can ever read your unencrypted data.

---

## ✨ Features

- 🛡️ **Zero-Knowledge Encryption**: All cryptographic operations occur entirely within your browser via the native Web Crypto API (`SubtleCrypto`). Plaintext passwords never leave your device.
- 🔑 **Credentials Vault**: Seamlessly add, edit, search, filter, and organize login credentials for all your web services.
- 🎲 **Built-in Password Generator**: Generate cryptographically strong, customizable passwords with adjustable lengths and character set controls (uppercase, lowercase, numbers, special symbols).
- 📊 **Real-time Password Strength Meter**: Dynamic visual feedback evaluating password entropy and security quality.
- ↕️ **Drag & Drop Reordering**: Custom visual list ordering with persistent database synchronization (`sort_order`).
- 📁 **Data Import & Export**:
  - Export vault backups in encrypted or structured **CSV** and **JSON** formats.
  - Import credentials from standard password managers (Bitwarden, 1Password, Chrome CSV).
- ⚙️ **Account & Key Management**: Change master passwords with automatic background re-encryption of all vault entries.
- 📱 **Fully Responsive UI**: Mobile-first design with responsive sidebar, desktop collapsed mode, and custom hamburger navigation tabs for screens below 768px.
- 🛠️ **First-Run Configuration Setup**: Intelligent setup wizard that prompts for Supabase credentials on launch if not pre-configured.

---

## 🔒 Security Architecture

Vault implements a strict **Client-Side Zero-Knowledge** security model:

```
[ User Input: Password + Email ]
               │
               ▼
   PBKDF2 Derivation (1,000,000 Iterations, SHA-256)
               │
               ▼
    256-bit AES-GCM Key (Browser Memory)
               │
      ┌────────┴────────┐
      ▼                 ▼
 Encrypt Record     Decrypt Record
 (AES-GCM + IV)     (AES-GCM + IV)
      │                 ▲
      ▼                 │
[ Base64 Ciphertext + IV to Supabase PostgreSQL ]
```

### Technical Cryptographic Specs

| Component | Specification |
| :--- | :--- |
| **Key Derivation Function** | `PBKDF2` with `SHA-256` hash |
| **PBKDF2 Iterations** | **1,000,000 iterations** |
| **Salt** | User's normalized Email address |
| **Symmetric Encryption** | `AES-GCM` (256-bit key length) |
| **Initialization Vector (IV)** | Cryptographically secure random 12-byte IV per item (`crypto.getRandomValues`) |
| **Key Storage** | Derived base64 key stored strictly in `localStorage` for session duration |
| **Database Security** | Supabase Row Level Security (RLS) enforcing `auth.uid() = user_id` |

---

## 📁 Directory Structure

```gfm
vault/
├── css/
│   └── style.css            # Custom CSS design system tokens, animations & layout rules
├── js/
│   ├── config.js            # Supabase API URL and Anon Key configuration
│   ├── crypto.js            # WebCrypto zero-knowledge module (PBKDF2, AES-GCM)
│   └── app.js               # Main application controller, state, drag-and-drop & UI logic
├── images/
│   └── logo.svg             # Vault SVG logo asset
├── index.html               # Authentication landing page (Sign in / Sign up)
├── dashboard.html           # Core Password Manager application dashboard
├── schema.sql               # PostgreSQL database schema, triggers & RLS policies
└── readme.md                # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites

- A web server or local HTTP environment (e.g. VS Code Live Server, Python HTTP server, or Nginx).
- A free [Supabase Account](https://supabase.com) project.

### 2. Database Setup

1. Log into your Supabase Dashboard and navigate to the **SQL Editor**.
2. Open [`schema.sql`](file:///c:/Users/Gohar%20Rehman/Desktop/vault/schema.sql) from this repository.
3. Paste the contents into the Supabase SQL editor and click **Run**.

This creates the `passwords` table with Row Level Security (RLS) enabled and sets up the automatic `updated_at` trigger:

```sql
create table if not exists public.passwords (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  account_name text not null,
  username text,
  password text not null,
  iv text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.passwords enable row level security;

create policy "Users can manage their own passwords"
  on public.passwords for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 3. Application Configuration

You can configure your Supabase connection credentials in one of two ways:

#### Option A: Edit [`js/config.js`](file:///c:/Users/Gohar%20Rehman/Desktop/vault/js/config.js)
Open [`js/config.js`](file:///c:/Users/Gohar%20Rehman/Desktop/vault/js/config.js) and insert your project credentials:
```javascript
window.SUPABASE_URL = "https://your-project-ref.supabase.co";
window.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";
```

#### Option B: First-Run GUI Setup Wizard
If `config.js` contains placeholders, Vault automatically launches an interactive configuration setup dialog in your browser on first load, prompting you to enter your **Supabase URL** and **Publishable Key**. Credentials are saved securely to your browser's local storage.

### 4. Running the App Locally

Launch a local development server in the repository directory:

**Using Python:**
```bash
python -m http.server 8000
```
Or using Node.js `serve`:
```bash
npx serve .
```

Open your browser and navigate to `http://localhost:8000`.

---

## 🛠️ Usage Guide

1. **Account Creation**: Register with your email and master password on `index.html`. Your master key is derived locally and never transmitted.
2. **Adding Credentials**: Click **+ Add Password** on the dashboard, fill in account details, or click **Generate** to produce a secure password.
3. **Copying & Viewing Passwords**: Toggle password visibility or copy passwords directly to the clipboard with one click.
4. **Reordering Entries**: Click and drag any item handle to customize your vault arrangement.
5. **Import & Export**:
   - Navigate to the **Import & Export** sidebar tab.
   - Choose **Export** to save a JSON or CSV backup.
   - Choose **Import** to migrate credentials into your vault.
6. **Changing Master Password**: Access **Settings**, enter your new master password, and Vault will automatically re-encrypt all existing items with the new derived key.

---

## 💻 Tech Stack & Dependencies

- **Frontend**: HTML5, Modern ES6+ JavaScript, Web Crypto API (`window.crypto.subtle`)
- **Styling**: [Tailwind CSS (CDN)](https://tailwindcss.com), Custom CSS variables & design system
- **Typography**: [Inter](https://fonts.google.com/specimen/Inter) & [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)
- **Backend & Auth**: [Supabase JS Client v2](https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2)
- **Database**: PostgreSQL with Row Level Security (RLS)

---

## 🛡️ License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute it for personal or commercial projects.
