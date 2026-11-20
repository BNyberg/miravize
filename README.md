# Miravize

Workspace-scoped time tracker, client reports with project hour splits, and an Anthropic-powered support request logger.

## Stack

- Frontend: React + Vite + TypeScript, Tailwind, shadcn-style UI
- Hosting: Cloudflare Pages (SPA)
- Backend: Supabase Auth, Postgres, Storage, Edge Functions

## Local setup

1. Copy `.env.example` to `.env` and add your Supabase URL and publishable key (`sb_publishable_…` from Project Settings → API Keys).
2. In the Supabase project, run `supabase/migrations/0001_init.sql`.
3. In the Supabase dashboard, open **Edge Functions → Secrets** (also under Project Settings → Edge Functions) and add `ANTHROPIC_API_KEY`. The platform injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; do not add those.
4. **Edge Functions → Deploy a new function**, name it `extract-request`, and paste `supabase/functions/extract-request/index.ts`. Leave JWT verification enabled.

5. Confirm Storage bucket `request-screenshots` exists (created by the migration).
6. Install and run:

```bash
npm install
npm run dev
```

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- SPA fallback is `not_found_handling = "single-page-application"` in `wrangler.toml`

Keep `ANTHROPIC_API_KEY` in Supabase Edge secrets only.

## Design

Visual rules live in `design-system/miravize/MASTER.md` (ui-ux-pro-max), with brand green `#1C9C71` / `#23C78B` and OLED dark surfaces.
