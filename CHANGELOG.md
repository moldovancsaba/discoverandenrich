# Changelog

Generated from git history by `management/scripts/changelog-from-git.mjs`. Do not edit by hand: regenerate it.
Covers history up to commit `2f0d625` (2026-10-05).

## 2026-10-05

- Documentation baseline: add HANDOVER.md, .env.example and docs/INDEX.md; correct README app names, layout and env-file location; mark rae_handover.md as a dated snapshot (`2f0d625`)
- Make AGENTS.md the canonical agent file, add a licence, ignore OS and run noise (`27bc096`)

## 2026-09-09

- Record the CSRF finding and its fix where this repo keeps incidents (`0a3cdb6`)
- A hostile website could drive the owner's own browser at the admin page; now it cannot (`7896149`)

## 2026-09-08

- The admin page is always on now; say so where someone would look (`cca6ac4`)
- npm test passes: the SDK install was truncated, not the dependency (`10c8fb5`)
- The admin page is local-only now, and the first guard for it guarded nothing (`228b91a`)

## 2026-09-07

- A note box on every actionable row, and dead links labelled by kind (`43bc801`)
- Dead links you can act on, one row at a time (`a3baf2d`)
- Dismiss was working; the page could not see it. And the machine can do the work (`f2e95ea`)
- Approve was the wrong button on every proposal the page was showing (`0ec4b8d`)
- An OpenClaw admin page, reading the local workspace (`98c7324`)

## 2026-08-14

- Stop tracking every .env file, and make .gitignore actually cover them (`0f8ba54`)
