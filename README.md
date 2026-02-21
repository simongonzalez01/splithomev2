# SplitHome 2.0

A shared household app for tracking shared expenses, budgets, fixed bills, a shopping list, events, and settlements — built for two.

Built with **Next.js 15 App Router + TypeScript + Tailwind CSS + Supabase**.

---

## Setup (Windows, Node.js LTS)

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in / create an account (free tier is fine).
2. Click **New project**, choose a name (e.g. `splithome`), set a database password, and click **Create new project**.
3. Wait ~1 minute for the project to be ready.

---

### 2. Run the Database SQL

**Fresh install (no existing database):**

1. Open the left sidebar in Supabase → **SQL Editor** → **New query**.
2. Paste the contents of **`supabase_setup.sql`** and click **Run**.

**Upgrading from SplitHome 1.0:**

1. Run **`supabase_setup.sql`** first (if you haven't).
2. Then run **`supabase_upgrade.sql`** — it adds new tables (budgets, fixed_expenses, settlements, monthly_snapshots) and a `note` column to expenses without breaking anything.

> ⚠️ Run `supabase_upgrade.sql` **after** `supabase_setup.sql`. The upgrade script is safe to run multiple times (`CREATE TABLE IF NOT EXISTS`).

---

### 3. Get Your Supabase API Keys

1. Left sidebar → **Project Settings** → **API**.
2. Copy:
   - **Project URL** → `https://abcdefgh.supabase.co`
   - **anon / public** key

---

### 4. Create `.env.local`

In the project root, create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

### 5. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Sign up, create or join a family, and start tracking!

---

### 6. Deploy to Vercel

1. Push to a GitHub repository.
2. Import at [vercel.com](https://vercel.com) and add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Click **Deploy**.
4. In Supabase → **Authentication → URL Configuration** add your Vercel domain to **Site URL** and **Redirect URLs**.

---

### 7. Install as PWA on iPhone

1. Open the deployed URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. The app opens full-screen from your home screen.

---

## Project Structure

```
split home/
├── app/
│   ├── (protected)/          ← all authenticated routes
│   │   ├── layout.tsx        ← slim header + 6-tab bottom nav
│   │   ├── page.tsx          ← Dashboard (server component)
│   │   ├── family/           ← /family  (create or join — no family yet)
│   │   ├── expenses/         ← /expenses
│   │   ├── fixed/            ← /fixed   (gastos fijos)
│   │   ├── budgets/          ← /budgets
│   │   ├── shopping/         ← /shopping
│   │   ├── events/           ← /events
│   │   ├── history/          ← /history (monthly snapshots)
│   │   └── profile/          ← /profile (family code, settlements, logout)
│   ├── login/
│   ├── signup/
│   ├── layout.tsx            ← root layout (PWA metadata)
│   └── globals.css
├── components/
│   ├── BottomNav.tsx         ← 6-tab nav: Home Gastos Fijos Lista Eventos Perfil
│   └── CategorySelect.tsx    ← grouped <select> for expense categories
├── lib/
│   ├── categories.ts         ← CATEGORIES array, getCategoryLabel, FIXED_PRESETS
│   └── supabase/
│       ├── client.ts
│       ├── server.ts
│       └── middleware.ts
├── middleware.ts
├── scripts/
│   └── generate-icons.mjs   ← generates public/icons/icon-192.png + icon-512.png
├── supabase_setup.sql        ← original schema (v1)
├── supabase_upgrade.sql      ← additive upgrades for v2
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-192.png      ← auto-generated (run scripts/generate-icons.mjs)
│       └── icon-512.png
└── .env.local
```

---

## Features

| Feature | Details |
|---|---|
| **Auth** | Email + password. Session persists on refresh. |
| **Family** | Create (6-char code) or join by code. One family per user. |
| **Expenses** | CRUD with amount, category, paid_by, optional note, date. Filter by month/category/search. |
| **Gastos Fijos** | Recurring bill templates (Netflix, internet, etc.). "Mark as paid" creates a real expense. |
| **Presupuestos** | Monthly budget per category with green/yellow/red progress bars. Copy from last month. |
| **Lista de Mercado** | Shared shopping list with quick-add suggestions, toggle bought, bulk delete. |
| **Eventos** | Shared calendar events with dates and notes. |
| **Liquidaciones** | Register payments between family members (who paid whom). Shown on Profile page. |
| **Historial** | Close a month to save a snapshot. View totals and top categories per past month. |
| **Dashboard** | Overview: balance, top categories, budget usage, upcoming events, shopping preview. |
| **PWA** | Installable via Safari "Add to Home Screen". Blue 192px/512px icons included. |

---

## Notes

- **Email confirmation**: Disable in Supabase → **Authentication → Settings → "Enable email confirmations"** for local dev.
- **Env vars**: Never commit `.env.local` (it's in `.gitignore`).
- **Regenerate icons**: Run `node scripts/generate-icons.mjs` any time to recreate the PNG icons.
- **Categories**: Edit `lib/categories.ts` to add/rename categories. Run a data migration if you rename existing category values in your database.
