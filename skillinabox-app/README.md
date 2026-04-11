# Skillinabox Portfolio Platform

A full-stack portfolio platform for Skillinabox learners — built with React + Vite + Supabase.

## What it does

- **Admin** can add learners, upload garment photos, get AI auto-tagging (via Claude), and publish portfolio websites with one click
- **Learners** can log in, upload their own garment photos, set pricing and descriptions, view enquiries, and share their portfolio
- **Portfolio pages** are publicly accessible and include an enquiry/order form

---

## Setup (≈ 20 minutes)

### 1. Clone and install

```bash
git clone <your-repo>
cd skillinabox-platform
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy your **Project URL** and **anon key** from Settings → API

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key
```

### 4. Set up the database

1. Go to Supabase Dashboard → SQL Editor
2. Paste and run the entire contents of `schema.sql`

### 5. Set up storage

The `schema.sql` file creates the storage bucket automatically. If you get an error, manually create it:
1. Supabase Dashboard → Storage → New bucket
2. Name: `garments` | Make it **Public**

### 6. Deploy the AI tagging Edge Function

```bash
# Install Supabase CLI first: https://supabase.com/docs/guides/cli
npm install -g supabase

supabase login
supabase link --project-ref your-project-ref

# Set your Anthropic API key as a secret
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Deploy the function
supabase functions deploy tag-garment
```

### 7. Create the admin account

1. Go to Supabase Dashboard → Authentication → Users → Invite user
2. Enter your admin email address
3. Accept the invite and set a password
4. Go to SQL Editor and run:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE id = 'paste-your-user-id-here';
   ```
   (Find your user ID in Authentication → Users)

### 8. Run locally

```bash
npm run dev
# Opens at http://localhost:5173
```

---

## Deployment (Vercel recommended)

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New project → Import from GitHub
3. Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy

Update your Supabase Edge Function CORS to allow your Vercel domain if needed.

---

## How to add a learner

1. Sign in as admin
2. Click **+ Add** in the sidebar
3. Fill in learner name, email, brand, phone
4. Copy the platform URL (e.g. `https://your-app.vercel.app/login`) and send to the learner
5. The learner visits the URL → clicks "Learner login" → "New learner? Sign up" → signs up with the exact email you registered
6. Their account is automatically linked

---

## How to publish a portfolio

1. Select a learner in the admin sidebar
2. Upload garment photos (AI auto-tags them)
3. Review and edit tags, set pricing
4. Click **↗ Generate & publish website**
5. The portfolio is live at `/portfolio/brand-slug`

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Routing | React Router v6 |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| AI tagging | Claude claude-sonnet-4-20250514 via Supabase Edge Function |
| Deployment | Vercel (frontend) + Supabase (backend) |

---

## File structure

```
src/
├── App.jsx          — Auth context + routing
├── main.jsx         — Entry point
├── index.css        — Global styles
├── lib/
│   ├── supabase.js  — Supabase client + helpers
│   └── utils.js     — Shared utilities
├── components/
│   └── ui.jsx       — Shared UI components
└── pages/
    ├── Login.jsx    — Auth page (admin + learner)
    ├── Admin.jsx    — Admin dashboard
    ├── Learner.jsx  — Learner dashboard
    └── Portfolio.jsx — Public portfolio page

supabase/
└── functions/
    └── tag-garment/ — Edge Function for AI tagging
        └── index.ts

schema.sql           — Full database schema + RLS policies
```

---

## Phase 2 (planned)

- [ ] AI image generation (Fashn.ai or self-hosted CatVTON) for model poses
- [ ] Credit system with Razorpay payment integration
- [ ] Custom domain mapping for learner portfolios
- [ ] Email notifications for new enquiries
- [ ] Analytics dashboard for admin
