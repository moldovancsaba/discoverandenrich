# HANDOVER: discoverandenrich (ContentCreator agent runtime)
Date: 2026-10-05. Owner: moldovancsaba. Board: https://github.com/users/moldovancsaba/projects/57. Repo: https://github.com/moldovancsaba/discoverandenrich. Production: https://discoverandenrich.vercel.app (`/api/health` returned 200 on 2026-10-05; the GitHub homepage field still says `researchandenrich.vercel.app`, which returns `DEPLOYMENT_NOT_FOUND`).

## What this is
The instruction set and validation layer a research agent follows to find and enrich records for two target apps: salesleadgenerator (tenants cogmap, seyu, dvsc) and classscout.ai (tenant classscout). It holds prompts, `tenants.json`, `apps.yaml`, `workers/`, `schema-mapper.js`, `runtime/`, a search router, regression gates, and a small Next.js app. It is NOT the pipeline itself and NOT either target app (their schemas are mirrored here, not imported). Its one live use today is the local-only `/openclaw` admin page. Details: [README.md](README.md).

## State today
- Version: `package.json` 0.1.0, private, no tags. Node >=20.9.0 (CI uses 22). Single branch `main`; the remote also has three `archive/*` tags.
- Deploy: Vercel Git integration. GitHub Deployments shows a Production deployment per push, the latest for `27bc096` (HEAD) on 2026-10-05. `vercel.json` is `{}` (Next.js auto-detect). Which Vercel project owns it is unverified: `.vercel/project.json` says `contentcreator`, the deployment URLs say `discoverandenrich`.
- Last changes: `27bc096` (2026-10-05) AGENTS.md canonical, license; `0a3cdb6`/`7896149` (2026-09-09) CSRF guard for `/openclaw`; 2026-09-07/08 the `/openclaw` page. History on `main` is 12 commits starting 2026-08-14.
- Works: `npm test` passed locally on 2026-10-05 (exit 0: schema-mapper 151 checks, cron-generator 26, runtime 23, runners 6, search-router 42 tests). `Tenant status guard` workflow is green.
- Known broken: the `verify` workflow is red on `main` (also on 2026-09-09). Typecheck, test and build pass; `npm run audit` fails on 5 un-baselined advisories (root: js-yaml; search-router: fast-uri, hono, ip-address, qs), which skips the two CI assertions after it. Issue #30 (Next 16) is open; `next` is baselined in `scripts/audit-gate.js`.
- Also open: `app/api/leads/route.ts` still exports GET/POST/PUT that echo input with no auth on the public deployment (GET verified live); board item #18 "retire the unauthenticated echo endpoint" is marked Done.

## What runs where today
- The OpenClaw install at `/Users/Shared/Projects/OpenClaw` runs the real operation. Its workspace repo (`/Users/Shared/Projects/OpenClaw/.openclaw/workspace`) owns the rules and state: [HANDOVER.md](/Users/Shared/Projects/OpenClaw/.openclaw/workspace/HANDOVER.md), [SSOT.md](/Users/Shared/Projects/OpenClaw/.openclaw/workspace/SSOT.md), [JOBS.md](/Users/Shared/Projects/OpenClaw/.openclaw/workspace/JOBS.md). Read them; do not copy from them.
- Per that SSOT.md (section 4, "The prompt library"), nothing in the workspace reads this repo at runtime; the `Agents/contentcreator` symlinks were removed 2026-09-01. Per its HANDOVER.md section 1 (2026-09-29), salesleadgenerator jobs are paused by the owner. So `tenants.json` and `config/cron.yaml` here are not the live switchboard (its `jobs.json` is).
- The `/openclaw` page is served from THIS directory by launchd `ai.openclaw.admin` (`next dev`, 127.0.0.1:3000; 200 on 2026-10-05). Edits to `app/`, `lib/`, `middleware.ts` reach it with no deploy. How to check or restart it: `/Users/Shared/Projects/OpenClaw/tools/openclaw-admin/README.md`.

## Run, test, deploy
```
npm ci                                   # CI also runs: npm --prefix search-router/seyu-search-router ci
npm test                                 # every suite + `node config/cron-generator.js --check` (Definition of Done)
npx tsc --noEmit                         # CI typecheck
npm run build                            # CI build (next build)
npm run audit                            # node scripts/audit-gate.js
node config/cron-generator.js            # after any change to tenants.json or workers/*/*.yaml; commit config/cron.yaml
```
Deploy: push to `main`; Vercel builds it. There is no manual step. `npm run dev` exists but do not run it by hand on the OpenClaw host (the service holds port 3000). `npm run lint` is defined but there is no ESLint config in the repo and CI does not run it (unverified). Env var NAMES: [.env.example](.env.example).

## In flight
Board 57: 20 items. Todo (NEXT): #9 rotate exposed credentials, #10 purge them from history (blocked on #9; both p0, owner/ops action). Done: #11 to #28. Open issues: #9, #10, #30 (Next 16 migration; not on the board). No open PRs. The board README still describes the 2026-08-10 audit plan, including `/admin` work that no longer applies.

## Traps and decisions
- Names: folder and GitHub repo `discoverandenrich`; `package.json` name `researchandenrich`; Vercel project `contentcreator`. `launchctl getenv RAE_ROOT` still points at `/Users/Shared/Projects/researchandenrich`, which does not exist (checked 2026-10-05). `scripts/purge-history.sh` still defaults to the old repo URL.
- `AGENTS.md` (copy: `CLAUDE.md`) rules: commit identity `moldovancsaba <moldovancsaba@gmail.com>`, no AI attribution, one commit may change `status`/`enabled` of only ONE tenant (CI-enforced), new tenants ship paused, one board per repo.
- Ownership ([docs/AGENT_COLLABORATION_CONTRACT.md](docs/AGENT_COLLABORATION_CONTRACT.md)): `prompts/**` belongs to the OpenClaw operator. A prompt the mapper cannot satisfy is a finding, not a prompt to rewrite. Only the operator writes to production APIs; salesleadgenerator has no delete endpoint, so a test POST is permanent; verify by list, never GET-by-id.
- Config is files only: `tenants.json`, `apps.yaml`, `workers/*/*.yaml`. The `/admin` dashboard is gone (verified: no `app/admin`, no `/api/admin`; README, LLD section 8).
- `/openclaw` answers 404 off this machine on purpose; do not "fix" it ([RUNTIME_ARCHITECTURE_NOTES](docs/RUNTIME_ARCHITECTURE_NOTES.md) sections 21 and 22).
- Secrets: never open `.env*` or `.vercel/`. Env files live outside the clone (`prompts/RUNTIME_PATHS.md`). `main` tracks no env file, and docs cite commits (for example `56a5785`, `6195129`) that no longer exist here, so history was rewritten at some point; no doc records it. #9 and #10 are still open, so treat the old credentials as exposed until the owner says otherwise.
- Tracked despite `.gitignore`: `search-router/seyu-search-router/node_modules` (3461 files), `.vercel/project.json`, 14 `runs/*.json` records.
- [rae_handover.md](rae_handover.md) is a 2026-08-13 snapshot; its symlink and tracked-env statements are superseded by this file.
- Section numbers in RUNTIME_ARCHITECTURE_NOTES repeat (13 to 17 appear twice); cite by title.

## First hour for the next agent
1. `git fetch origin main && git log --oneline HEAD..origin/main`, then `git config user.email` (must be `moldovancsaba@gmail.com`).
2. Read `AGENTS.md`, this file, [docs/INDEX.md](docs/INDEX.md), the collaboration contract, then the three OpenClaw workspace files above.
3. `npm test` and confirm it exits 0.
4. `gh run list --workflow verify --limit 3`; the Audit failure needs an owner decision (fix advisories or baseline them with a reason).
5. `curl -s https://discoverandenrich.vercel.app/api/health` and `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/openclaw`.
6. Ask the owner about #9/#10 before anything touching credentials or history.

## Where things live
[README.md](README.md) layout and onboarding · [docs/INDEX.md](docs/INDEX.md) all docs · `app/`, `lib/`, `middleware.ts` Next.js app and `/openclaw` · `prompts/` operator-owned prompts · `schema-mapper.js`, `runtime/` mapping and verifiers · `config/` cron generator and defaults · `scripts/` gates and live tests · `search-router/` MCP search server · `.github/workflows/` CI.
