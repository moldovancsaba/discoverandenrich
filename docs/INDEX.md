# docs/ index

Every document under `docs/`, once. Currency is read from each file's own dates and from `git log`; history on `main` starts 2026-08-14 (a root commit), so file dates in git are not reliable. Current state of the repo as a whole: [../HANDOVER.md](../HANDOVER.md).

| Document | What it is for | How current it looks |
|---|---|---|
| [AGENT_COLLABORATION_CONTRACT.md](AGENT_COLLABORATION_CONTRACT.md) | Binding contract between the OpenClaw operator agent and the repo developer agent: who owns which paths, decision rights, shared contracts, production-data rules, working rhythm. | Undated; refers to events of 2026-08-12. Consistent with `AGENTS.md` on the rules both state (tests as definition of done, tenant-status rule, no AI attribution). It still names `CLAUDE.md` where `AGENTS.md` is now canonical. |
| [AGENT_RUNTIME_FINDINGS.md](AGENT_RUNTIME_FINDINGS.md) | What actually happened when OpenClaw ran these prompts on real hardware: credential locations, per-tenant auth headers, model needs, rate limits, failed runs. | Dated 2026-08-12, measured on one OpenClaw version. The OpenClaw side has changed since; the live rules are in its workspace repo (see HANDOVER). |
| [LLD.md](LLD.md) | Module-by-module inventory: config schemas, `schema-mapper.js`, `runtime/`, `config/`, prompts, search router, scripts, `.mcp.json`, data model. | First written 2026-08-02 and partly updated for the 2026-08-12 admin retirement. Out of date in places: it says `package.json` has no `test` script (it has one), gives `schema-mapper.js` as about 414 lines (now 1093), shows the old hardcoded prompt paths (now `$RAE_ROOT`), and does not cover `/openclaw`, `lib/` or `middleware.ts`. |
| [OPENCLAW_OPERATOR_HANDOVER.md](OPENCLAW_OPERATOR_HANDOVER.md) | Operator-to-developer split by domain, the path-contract near-miss, and where each side's changes can silently break the other. | Operator state is "as of 2026-08-12". The ownership table and section 3 and 4 rules still hold; the operator state itself is superseded by the OpenClaw workspace `HANDOVER.md` and `SSOT.md`. |
| [RUNTIME_ARCHITECTURE_NOTES.md](RUNTIME_ARCHITECTURE_NOTES.md) | Dated findings and incident log (about 1,340 lines): tenant onboarding, tenant-status incident, identity incident, `/admin` retirement, shared field contract, `/openclaw` guard and CSRF fix. | Most current doc here: latest entry is section 22, 2026-09-08. Section numbers repeat (13 to 17 each appear twice); cite by title. |

Related documents outside `docs/`:
- [../README.md](../README.md): repo layout, onboarding, per-tenant toggles, deployment.
- [../AGENTS.md](../AGENTS.md): working rules (`CLAUDE.md` is an identical copy).
- [../rae_handover.md](../rae_handover.md): 2026-08-13 operational snapshot, kept for its detail; superseded where it disagrees with HANDOVER.md.
- [../prompts/RUNTIME_PATHS.md](../prompts/RUNTIME_PATHS.md): how prompts resolve `$RAE_ROOT` and `$RAE_ENV_DIR` (operator-owned).
