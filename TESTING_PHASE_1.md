# Phase 1 testing

Phase 1 checks that the frontend builds, that the Cloudflare config is still an assets-only Worker, and that the built files load in the local Workers runtime. It does not test the database, row level security, encryption, MFA, or signed-in product flows.

The deploy target is Workers Static Assets. [`wrangler.toml`](wrangler.toml) sets `name = "miravize"`, `[assets] directory = "./dist"`, and `not_found_handling = "single-page-application"`. There is no Worker script and no `pages_build_output_dir`. Do not switch that back to Pages.

## Commands

```bash
npm run check:build
npm run test:unit
npm run check:smoke
```

`check:build` is the preflight. It stops at the first failing step:

1. `node scripts/check-cloudflare-config.mjs`
2. `tsc -b`
3. `npm run lint` (oxlint, not ESLint)
4. `vite build`
5. `node scripts/check-build-artifacts.mjs`
6. `wrangler deploy --dry-run --no-autoconfig --env="" --outdir .wrangler/dry-run`

`check:smoke` needs a fresh `dist/`. It starts `wrangler dev` on `127.0.0.1:8787`, checks routes and asset content types, then runs one Playwright test. The first time on a machine, install the browser:

```bash
npx playwright install chromium
```

`test:unit` typechecks the Vitest files, runs the existing crypto and onboarding `node:test` files, then Vitest.

Node is pinned to `24.22.1` in [`.nvmrc`](.nvmrc). This machine's Node matches that. Its npm is `11.19.1`. The older Cloudflare image reported npm `10.9.2` with the same Node. CI uses the npm that the official Node `24.22.1` build ships, and `npm ci` installs from the lockfile. Wrangler is the locked `4.166.0` devDependency. Do not call an unpinned `npx wrangler`.

The build reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both are public client values. If they are missing, the build still succeeds and the app shows the setup screen. CI smoke sets dummy values so the router mounts. Do not put server secrets in `VITE_` variables.

## What a Wrangler dry run does not prove

`wrangler deploy --dry-run` compiled the assets-only Worker locally and exited with `--dry-run: exiting now`. It did not ask for `CLOUDFLARE_API_TOKEN`. The line `Total Upload: 0.31 KiB` is the Worker metadata, not the size of `dist`.

A dry run does not upload, and it does not run the Cloudflare API check that rejected `public/_redirects` with error `100324`. That check happens only on a real deploy. The manual staging workflow is the place for that, and it has not been run.

`--env=""` selects the top-level Worker `miravize`. `--env staging` selects `miravize-staging`. A normal deploy without `--env` still uses the top-level name, but Wrangler warns when environments exist, so the preflight passes `--env=""`.

## Local results on 21 November 2026

| Command | Result |
| --- | --- |
| `npm run check:build` | Exit 0. TypeScript, oxlint, Vite, artifact check, and the production dry run passed. |
| `npm run test:unit` | Exit 0. Crypto 10, onboarding 4, Vitest 27, redirect rules 4. |
| `npm run check:smoke` | Exit 0. Static checks passed. Playwright `tests/smoke/app.spec.ts` passed (1 test). |
| `wrangler deploy --env staging --dry-run --no-autoconfig --outdir .wrangler/dry-run-staging` | Exit 0. It read `dist` and exited before upload. |

Oxlint printed existing warnings and still exited 0. Those warnings are not Phase 1 failures.

The main chunk on this build was `dist/assets/index-BMa3EC2v.js`, 2310.6 KiB before gzip (Vite reported 710.79 kB gzip). The filename hash will change. The warning is not a failed check, and the app was not split to silence it.

GitHub Actions has not run. Nothing was committed, pushed, or deployed.

## Reproduce a CI failure

The three required jobs do not share a build. Run the same command the job runs:

- Frontend Build Validation: `npm run check:config && npx tsc -b && npm run lint && npx vite build && npm run check:artifacts`
- Cloudflare Deployment Preflight: `npm run check:build && npx playwright install chromium && npm run check:smoke`
- Frontend Unit Tests: `npm run test:unit`

CI runs on Ubuntu, so a filename whose case does not match its import fails there even if macOS accepts it. `tsc -b` and `vite build` are the checks that catch it.

## Staging deploy

[`.github/workflows/cloudflare-staging.yml`](.github/workflows/cloudflare-staging.yml) is `workflow_dispatch` only. It is not a required check. It refuses to start unless `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, then runs `check:build` and `wrangler deploy --env staging --no-autoconfig`. The Worker name in that environment is `miravize-staging`.

Before the first run, create a Cloudflare API token that can deploy Workers scripts, store it and the account id as repository secrets, and optionally store `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Without those two, the staging site builds and shows the unconfigured screen. The HTTP checks still require the shell and a real JavaScript file.

The workflow looks for an `https://….workers.dev` URL in Wrangler's output. If a future Wrangler stops printing that URL, the job fails even when the upload worked. That has not been observed, because this session did not deploy.

## GitHub branch protection

After you push these workflows to `staging`, open **Settings → Rules → Rulesets** for `main`:

- Require a pull request before merging.
- Require these status checks, using these exact names:
  - `Phase 1 / Frontend Build Validation`
  - `Phase 1 / Cloudflare Deployment Preflight`
  - `Phase 1 / Frontend Unit Tests`
- Do not add `Cloudflare Staging / Cloudflare Staging Deployment` until you have dispatched that workflow and seen it pass.
- Block direct pushes to `main` for ordinary roles.
- Do not allow a bypass of failing required checks.
- Leave path filters off. The workflow has none, so a docs-only change still runs the checks.

The workflows do not use SSH keys. GitHub-hosted runners check out the repo with the Actions token.

Required checks do not stop Cloudflare if the dashboard builds on every push. After the ruleset, unreviewed commits cannot land on `main`. In the Cloudflare dashboard, confirm the production Worker `miravize` builds from `main` only, and that a push to `staging` does not deploy that Worker. If the dashboard still deploys every branch to `miravize`, a green CI run cannot prevent that. This session did not change the dashboard. The repo cannot see whether that automatic deploy is on.

## Troubleshooting

1. **TypeScript.** `tsc -b` fails the preflight. `noUnusedLocals` and `noUnusedParameters` are on, so unused declarations fail here. `onOpenAutoFocus` is still passed through a cast in `src/components/ui/dropdown-menu.tsx`. Removing the cast reproduced `TS2339` / `TS2322` (`Did you mean 'onCloseAutoFocus'?`) and `TS7006`. The cast stays because the dropdown content type does not include that prop. Do not add new casts to get past `tsc`.

2. **Missing Worker entry point.** `pages_build_output_dir` makes `wrangler deploy` look for a Worker script. The config check fails if that key returns. The current file uses `[assets]` and no `main`, which is valid.

3. **Pages and Workers mixed.** The same check fails on `pages_build_output_dir`, a Workers Sites `site` bucket, or an `assets.binding` without a `main` file.

4. **`_redirects` error 100324.** `/* /index.html 200` matches its own destination. `scripts/check-cloudflare-config.mjs` rejects that rule in `public/_redirects`, and the artifact check rejects it in `dist/_redirects`. A specific rule such as `/docs /help 301` is still allowed. SPA fallback stays in `not_found_handling`. Do not recreate the splat.

5. **Missing assets.** The artifact check fails when `dist/index.html` is absent, or when a script or stylesheet it references is missing or is HTML. Smoke then requests those same URLs from `wrangler dev` and requires a non-HTML content type.

6. **Build and deploy command mismatch.** The production dry run is `wrangler deploy --dry-run --env=""`. The staging workflow is `wrangler deploy --env staging`. Neither command is `wrangler pages deploy`.

## Known limits

Workers SPA mode serves `index.html` with `text/html` for every path that is not a file, including `/assets/missing-file.js`. A `Sec-Fetch-Mode: cors` request did the same thing against `wrangler dev`. The smoke test records that and does not fail on it. It fails when a URL that `index.html` actually references comes back as HTML.

Authenticated screens, RLS, encryption, and MFA are out of scope. Phase 2 should add those, then promote the staging deploy to a required check after it has passed once. The 2.3 MB chunk is a separate performance task.
