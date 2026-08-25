---
name: verify-lightdash
description: Drive the Lightdash web app as a user (login, home, explorer, saved charts, dashboards) against a local Vite+API stack and capture proof. Use when proving a UI change works, reproducing a user path, or after implementing frontend behavior.
---

# Verify Lightdash

Agents read this cold. Drive the **web UI**, not internal Redux setters or Cypress-only helpers. Primary surface is the Vite app; the Express API is the same stack (`/api/v1/*`). Also present but out of scope for this skill: `@lightdash/cli`, headless unfurl, MCP warehouse tools.

Repo helpers live in `.cursor/skills/verify-lightdash/scripts/`. Feature recipes live in `features/`.

Harness is the **agent-browser** CLI (`npm` package `agent-browser`, commands `agent-browser …` or this repo’s wrapper). Do not drive with Playwright MCP, Cursor IDE browser MCP, or Cypress. If `agent-browser` is missing, install once: `npm i -g agent-browser && agent-browser install` (or use the wrapper, which falls back to `npx --yes agent-browser`). First machine also needs `agent-browser install` to fetch Chrome.

Before any drive command, load the version-matched guide: `agent-browser skills get core` (or `--full` when you need the command reference).

## Launch

Default local stack is **per worktree**, claimed by `./scripts/dev-ports.sh`. Shared Docker (Postgres base image, MinIO, mailpit, NATS, headless browser) is shared across instances. App ports and Postgres are per instance.

**Prefer attaching.** `resolve-env.sh` uses the first healthy pair among: claimed `dev-ports.sh` slot, `PORT`/`FE_PORT` in `.env.development.local`, then `http://localhost:3000` + `http://localhost:8080`. This worktree may have a claimed slot that is down while a default 3000/8080 stack is up — attach to the live pair. Do not start a second copy of the same `LD_INSTANCE_ID`. Two checkouts can run side by side only after each has its own claimed slot.

Cold start via `./scripts/dev-fast-start.sh` needs `venv/bin/dbt1.12`. If that shim is missing, do not fight the venv from this skill: attach to an already-healthy UI instead, or fix the machine venv outside verification.

```bash
# From repo root. Prints VERIFY_RUN_ID and EVIDENCE_DIR.
.cursor/skills/verify-lightdash/scripts/launch.sh
eval "$(.cursor/skills/verify-lightdash/scripts/resolve-env.sh)"
export VERIFY_RUN_ID   # from launch.sh stdout if not already set
export EVIDENCE_DIR
export AGENT_BROWSER_SESSION="ld-verify-${VERIFY_RUN_ID}"
```

Ready when doctor prints `READY:` and `GET ${API_URL}/api/v1/health` is 200. `./scripts/dev-fast-start.sh` is the only start command if doctor fails; it is idempotent and can take several minutes.

Seeded login (always, unless the user named another account): `demo@lightdash.com` / `demo_password!`. Seeded project name `Jaffle shop`, uuid `3675b69e-8324-4110-bdca-059031aa8da3` (still resolve via UI or `GET ${API_URL}/api/v1/org/projects` if the DB was re-seeded).

Isolation rules:

- Never `docker compose down` on shared compose from a verification run.
- Never `pkill` by process name (`node`, `vite`, `pm2`, `chrome`).
- Cursor Cloud / agent-harness / Okteto / exe.dev already own a stack; attach and skip launch. Ports may not be 3000/8080 — trust `resolve-env.sh` or the environment’s `READY:` URL.
- Always set `AGENT_BROWSER_SESSION`. The unnamed default session is shared with every other agent and the human’s leftover browser. Never `agent-browser close --all`.

## Doctor

Run first whenever anything looks off:

```bash
.cursor/skills/verify-lightdash/scripts/doctor.sh
```

It checks: a resolvable healthy frontend+API, API health 200, frontend `/login` 200, seed user API login 200. PM2 `${LD_INSTANCE_ID}-api` online is reported when present; missing PM2 is a warning if HTTP is healthy. Fail the run if HTTP or seed login fails; do not drive a sick instance.

## Drive

Wrapper (sets nothing; requires `AGENT_BROWSER_SESSION`):

```bash
AB=".cursor/skills/verify-lightdash/scripts/ab.sh"
$AB skills get core          # once per agent, if you have not read it
$AB open "${FRONTEND_URL}/login"
$AB snapshot -i
```

Core loop: `open` → `snapshot -i` → act on `@eN` refs or `find role|text|label|testid` → `wait --text` / `wait --url` / `wait --load networkidle` → `snapshot -i` again. Refs go stale after every page change.

Prefer `find` locators from this repo when you already know the name:

```bash
$AB find role button click --name "Continue"
$AB find label "Work email" fill "demo@lightdash.com"
$AB find testid "ExploreMenu/NewButton" click
$AB find text "Orders" click
```

**Session:**

1. `eval "$(.cursor/skills/verify-lightdash/scripts/resolve-env.sh)"` and set `AGENT_BROWSER_SESSION` as above.
2. `$AB open "${FRONTEND_URL}/login"` then `$AB snapshot -i`.
3. If already authenticated (`Browse` / `New`, or a heading containing `David`), skip login unless the feature file requires a logged-out start.
4. Login (two-step form, `name="login"`, card `#lightdash-login-page`):
   - Heading `Log in` (or legacy `Sign in`).
   - `$AB find label "Work email" fill "demo@lightdash.com"` (or label `Email address`).
   - `$AB find role button click --name "Continue"` (`data-cy="signin-button"`).
   - `$AB find label "Password" fill "demo_password!"`.
   - `$AB find role button click --name "Sign in"`.
   - `$AB wait --text "David"` or `$AB wait --text "Browse"`.
5. Follow the matching file under `features/`. Do not mark an entry point verified by using a different path.

Stable handles from this repo:

| What | Handle |
|---|---|
| Login card | `#lightdash-login-page` |
| Continue / Sign in | `data-cy="signin-button"` or button name `Continue` / `Sign in` |
| Home | link/button name `Home` → `/projects/:projectUuid/home` |
| New chart | `data-testid="ExploreMenu/NewButton"` then text `Chart` → `/tables` |
| Browse | button `Browse` → `All dashboards`, `All saved charts`, `All Spaces` |
| Tables list ready | `wait --text "Orders"` after `/tables` |
| Explore `Orders` | text `Orders` |
| Run explorer query | button name containing `Run query` |
| Seed dashboard | text/link `Jaffle dashboard` |
| Seed chart | `How much revenue do we have per payment method?` |
| Logout | user avatar → menuitem `Logout` |

Do not `$AB wait 2000` except when debugging. After a warehouse query, `$AB wait --text` that is not `Loading results` / `Loading chart`, then assert row or chart content.

## Evidence

Directory: `.cursor/skills/verify-lightdash/evidence/<VERIFY_RUN_ID>/` (gitignored except `.gitignore`). Cleanup must not delete it. Do not write screenshots or snapshots into the repo root.

Proof standards:

- Exercise the real user path. Do not POST `/api/v1/login` and call the UI done.
- Capture the action and the resulting state: snapshot before click, snapshot after, screenshot of the result with Lightdash chrome visible (logo or `Browse`).
- Mutations: reopen from a list or a second URL.
- Record feature ID and entry point in `evidence/<id>/proof.md`.
- Do not stub the Lightdash API.

Minimum artifacts per driven feature:

```bash
$AB snapshot -i > "${EVIDENCE_DIR}/home.aria.md"
$AB screenshot "${EVIDENCE_DIR}/home.png"
```

Plus `proof.md` (feature ID, URL, commands, what was observed).

## Cleanup

```bash
# Close only this run's agent-browser session, then stack teardown if owned.
.cursor/skills/verify-lightdash/scripts/ab.sh close
.cursor/skills/verify-lightdash/scripts/cleanup.sh "$VERIFY_RUN_ID"
```

If `run.env` has `OWNED=0` (attached), cleanup is a no-op for PM2/Docker. Leave the user’s Lightdash stack running. Never `close --all`.

If `OWNED=1`, cleanup deletes that instance’s PM2 names one by one. It does not release the port slot and does not stop shared Docker.

## Helpers

All are executable; run from any cwd:

```bash
.cursor/skills/verify-lightdash/scripts/resolve-env.sh   # export FRONTEND_URL API_URL …
.cursor/skills/verify-lightdash/scripts/doctor.sh        # read-only health
.cursor/skills/verify-lightdash/scripts/launch.sh        # attach or start; prints VERIFY_RUN_ID
.cursor/skills/verify-lightdash/scripts/ab.sh <cmd>      # agent-browser (needs AGENT_BROWSER_SESSION)
.cursor/skills/verify-lightdash/scripts/cleanup.sh <id>  # teardown if owned
```
