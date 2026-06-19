Manage Docker dev environment. Args: (none) = show status & help, `start` = auto-detect and setup, `stop` = stop this instance, `stop-all` = stop everything, `reset` = reset db from snapshot, `rebuild` = full db rebuild, `snapshot [name]` = save db snapshot, `list-snapshots` = list snapshots, `restore <name>` = restore named snapshot, `list-instances` = show all instances.

**NEVER use `scripts/reset-db.sh`** — it requires a local `psql` client which is not available. Instead, use `docker exec` to run psql inside the container, then run migrate/seed via pnpm.

## Arguments

- **No arguments**: Show current status, assigned ports, and available commands. Read-only, safe to run anytime.
- **`start`**: Bring this instance up. First runs **Step P: Instance profile selection** (capability multi-select → write secrets/flags), then the deterministic `scripts/dev-fast-start.sh` (idempotent, non-interactive); only falls back to agentic setup + **self-repair** if the script fails. Bootstraps new instances fast from a shared base snapshot.
- **`start <profiles>`**: Provision for named capabilities, comma-separated — e.g. `start ee` (turnkey EE: all AI + GitHub), `start github` (Core + dbt-over-GitHub, no AI), `start ee,slack`. Skips the menu. The AI tier is just **Core vs EE** — all AI features (agents, writeback, reviews classifier) are bundled into `ee`. See `scripts/dev-profiles.json`. `ee` requires `github` so writeback opens PRs out of the box; profiles run their GitHub/dbt-repo + classifier reconcile + verify automatically.
- **`start ee`** (also `start --ee`, "start with ee enabled", "enterprise"): The EE profile — provisions an Enterprise Edition license (`LIGHTDASH_LICENSE_KEY`), runs the EE migration/seed pass, and **bundles all AI features** (Copilot/agents, AI writeback, reviews classifier) plus the GitHub integration so writeback is turnkey. See **Enterprise Edition (EE) Mode** below. Auto-enabled if `.env.development.local` already contains `LIGHTDASH_LICENSE_KEY`. EE instances bootstrap from a dedicated EE base snapshot (`ld-shared_postgres_base_ee`) so they skip the slow EE migrate pass.
- **`stop`**: Stop this instance's PM2 processes and PostgreSQL. Shared services stay running. Releases port slot.
- **`stop-all`**: Stop ALL instances — all PM2 processes, all per-instance PostgreSQL containers, shared services, and release all port slots. Use when shutting down for the day.
- **`reset`**: Restore database from this instance's volume snapshot (fast, ~3 seconds). Fails if no snapshot exists.
- **`rebuild`**: Full database reset from scratch (drop schema, migrate, seed, dbt). Takes a new snapshot when done.
- **`snapshot [name]`**: Save a named snapshot of the current database state. Name is optional — if omitted, auto-generate a descriptive name.
- **`list-snapshots`**: List all named snapshots with their creation dates and sizes.
- **`restore <name>`**: Restore the database from a named snapshot.
- **`list-instances`**: Show all active development instances and their port assignments.

---

## Step 0: Port Allocation (ALWAYS run first, for ALL commands)

Before any other work, claim a port slot and load env vars:

```bash
./scripts/dev-ports.sh claim
eval "$(./scripts/dev-ports.sh env)"
```

This gives you:
- `$LD_INSTANCE_ID` — instance name (worktree basename)
- `$LD_COMPOSE_PROJECT` — docker compose project name
- `$LD_VOLUME_PREFIX` / `$LD_CONTAINER_PREFIX` — prefixes for volumes and containers
- `$LD_PG_PORT` — per-instance PostgreSQL port
- `$PORT`, `$FE_PORT`, `$SCHEDULER_PORT`, `$DEBUG_PORT`, `$SDK_TEST_PORT`, `$SPOTLIGHT_PORT`, `$LIGHTDASH_PROMETHEUS_PORT` — per-instance app ports
- `$PGPORT`, `$SITE_URL`, `$S3_ENDPOINT`, `$HEADLESS_BROWSER_PORT`, `$EMAIL_SMTP_PORT` — app config (shared ports hardcoded: S3=9000, browser=3001, SMTP=1025)

**Shared services** (minio, headless-browser, mailpit, nats) run once on fixed ports via `docker-compose.dev.shared.yml`. Only PostgreSQL is per-instance via `docker-compose.dev.instance.yml`.

---

## No Arguments: Status & Help

Show the current state of this instance. Run port allocation (Step 0) first, then:

```bash
./scripts/dev-ports.sh show
```

Then run the **State Detection** checks below and present the results as a status summary. After showing status, list available commands:

```
Available commands:
  /docker-dev start          Auto-detect and start what's needed
  /docker-dev stop           Stop this instance (preserves data)
  /docker-dev stop-all       Stop ALL instances and shared services
  /docker-dev reset          Restore db from snapshot (~3s)
  /docker-dev rebuild        Full db rebuild from scratch
  /docker-dev snapshot       Save current db state
  /docker-dev list-snapshots List saved snapshots
  /docker-dev restore        Restore a named snapshot
  /docker-dev list-instances Show all active instances
```

---

## `list-instances`

```bash
./scripts/dev-ports.sh list
```

---

## State Detection

Run these checks to determine what needs to be done. **Run checks 1-5 and 10 in parallel first**, then checks 6-8 in parallel (they depend on Docker running):

```bash
# Check 1a: Shared Docker services running (minio, headless-browser, mailpit, nats)
SHARED_COUNT=$(docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps --format json 2>/dev/null | grep -c '"State":"running"' || true)
[ "$SHARED_COUNT" -ge 4 ] && echo "OK: Shared Docker services running ($SHARED_COUNT)" || echo "NEED: Start shared Docker services (only $SHARED_COUNT/4 running)"

# Check 1b: Per-instance PostgreSQL running
INSTANCE_COUNT=$(docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml ps --format json 2>/dev/null | grep -c '"State":"running"' || true)
[ "$INSTANCE_COUNT" -ge 1 ] && echo "OK: Instance PostgreSQL running" || echo "NEED: Start instance PostgreSQL"

# Check 2: Environment file exists
test -f .env.development.local && echo "OK: Env file exists" || echo "NEED: Create .env.development.local"

# Check 3: CLAUDE.local.md has local dev instructions
grep -q "## Starting Development Services" CLAUDE.local.md 2>/dev/null && echo "OK: CLAUDE.local.md has local dev instructions" || echo "NEED: Add local dev instructions to CLAUDE.local.md"

# Check 3b (EE): license present but EE migrations not yet applied → /health will 500
# Only relevant when LIGHTDASH_LICENSE_KEY is in the env file. ai_agent_document is a recent EE
# migration table, absent from the core-only shared base — so it detects a missing EE migration pass.
if grep -q "^LIGHTDASH_LICENSE_KEY=" .env.development.local 2>/dev/null; then
  EE_APPLIED=$(docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='ai_agent_document') THEN 'yes' ELSE 'no' END" 2>/dev/null)
  [ "$EE_APPLIED" = "yes" ] && echo "OK: EE license present and EE migrations applied" || echo "NEED: EE license present but EE migrations NOT applied — run Step EE-2 (or /health will 500)"
else
  echo "OK: No EE license (core-only instance)"
fi

# Check 4: Dependencies installed and generated build artifacts present
#  - common/dist:                        compiled @lightdash/common
#  - formula/dist/grammar/parser.js:     Peggy-generated parser (gitignored, requires `pnpm build:grammar`)
#  - warehouses/.../ca-bundle-aws-redshift.crt: runtime asset copied by warehouses `copy-files` script
# All three must exist or the scheduler will crash-loop with `Cannot find module '../grammar/parser'`
# and ENOENT on the Redshift CA bundle.
if test -d node_modules \
  && test -f packages/common/dist/cjs/index.js \
  && test -f packages/formula/dist/grammar/parser.js \
  && test -f packages/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt; then
  echo "OK: Dependencies installed"
else
  echo "NEED: Run sfw pnpm install and build"
fi

# Check 5: Python/dbt environment ready
test -f venv/bin/dbt && test -f venv/bin/dbt1.7 && echo "OK: Python/dbt ready" || echo "NEED: Set up Python venv"

# Check 6: Database migrated (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN 'migrated' ELSE 'not_migrated' END" 2>&1 | grep -q "^migrated" && echo "OK: Database migrated" || echo "NEED: Run migrations"

# Check 7: Database seeded (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM emails WHERE email='demo@lightdash.com') THEN 'seeded' ELSE 'not_seeded' END" 2>&1 | grep -q "^seeded" && echo "OK: Database seeded" || echo "NEED: Seed database"

# Check 8: dbt models built (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders') THEN 'built' ELSE 'not_built' END" 2>&1 | grep -q "^built" && echo "OK: dbt models built" || echo "NEED: Build dbt models"

# Check 9: Volume snapshot exists (for fast resets)
docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1 && echo "OK: Volume snapshot exists" || echo "NEED: No volume snapshot (will be created after setup completes)"

# Check 10: Node version matches project requirement
REQUIRED_NODE=$(cat .nvmrc 2>/dev/null || cat .node-version 2>/dev/null || echo "")
CURRENT_NODE=$(node -v 2>/dev/null | sed 's/^v//')
if [ -z "$REQUIRED_NODE" ]; then
  echo "WARN: No .nvmrc or .node-version file found"
elif [ -z "$CURRENT_NODE" ]; then
  if command -v fnm >/dev/null 2>&1; then
    echo "NEED: Node not found but fnm is available — run: fnm install $REQUIRED_NODE && fnm use $REQUIRED_NODE"
  elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    echo "NEED: Node not found but nvm is available — run: nvm install $REQUIRED_NODE"
  elif command -v mise >/dev/null 2>&1; then
    echo "NEED: Node not found but mise is available — run: mise use node@$REQUIRED_NODE"
  else
    echo "NEED: Node not found and no version manager detected. Install one of:"
    echo "  fnm (recommended): curl -fsSL https://fnm.vercel.app/install | bash"
    echo "  nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash"
  fi
elif echo "$CURRENT_NODE" | grep -q "^${REQUIRED_NODE}"; then
  echo "OK: Node version $CURRENT_NODE matches required $REQUIRED_NODE"
else
  echo "NEED: Node version mismatch (running $CURRENT_NODE, project requires $REQUIRED_NODE)"
fi

# Check 11: PM2 processes running for this instance
PM2_PROC=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
instance_procs = [p for p in procs if p['name'].startswith('${LD_INSTANCE_ID}-')]
if instance_procs:
    cwd = instance_procs[0]['pm2_env']['pm_cwd']
    root = cwd.rsplit('/packages/', 1)[0] if '/packages/' in cwd else cwd
    print(f'RUNNING:{root}')
else:
    other = [p for p in procs if not p['name'].startswith('${LD_INSTANCE_ID}-')]
    if other:
        print('OTHER')
    else:
        print('NONE')
" 2>/dev/null || echo "NONE")

case "$PM2_PROC" in
  RUNNING:$(pwd)) echo "OK: PM2 running for this instance from this worktree" ;;
  RUNNING:*) echo "MISMATCH: PM2 for instance ${LD_INSTANCE_ID} running from ${PM2_PROC#RUNNING:} but current worktree is $(pwd)" ;;
  OTHER) echo "OK: Other PM2 instances running (no conflict)" ;;
  NONE) echo "OK: No PM2 processes running for this instance" ;;
esac
```

**Interpreting results:**
- `OK:` = ready
- `NEED:` = setup step required
- `MISMATCH:` = ask user before switching PM2 to this worktree

### Database Check Notes

- Uses `docker exec ${LD_CONTAINER_PREFIX}-db-dev-1 psql` (no local psql needed)
- `information_schema` queries avoid "relation does not exist" errors
- `emails` table is checked for seed status (not `users` — Lightdash separates identity from emails)

### Node Version Check Notes

- The project specifies its required Node version in `.nvmrc` (or `.node-version`)
- PM2 inherits the Node binary from the current shell — if the wrong version is active, native modules (like `lz4`) will fail with `ERR_DLOPEN_FAILED` / "Module did not self-register"
- This check uses a prefix match (e.g., required `20.19` matches `20.19.6`)
- The "Ensure Correct Node Version" step runs before `pnpm install` so native modules compile against the correct ABI

---

## Enterprise Edition (EE) Mode

Trigger when the user asks to start with **"ee"**, **"ee enabled"**, **"enterprise"**, or passes `start ee` / `start --ee`. Also auto-detect: if `.env.development.local` already contains `LIGHTDASH_LICENSE_KEY`, treat the instance as EE for all migrate/seed/snapshot steps.

### Why EE changes the flow

The license key is read once at module load in `packages/backend/src/knexfile.ts`:

```ts
const hasEnterpriseLicense = !!lightdashConfig.license.licenseKey; // from process.env.LIGHTDASH_LICENSE_KEY
```

When truthy, knex **appends two extra directories**: `./ee/database/migrations` (70+ EE migrations) and `./ee/database/seeds/development`. The license also gates every EE *service provider* — without it, EE services throw `Unable to initialize service 'X' - no factory or provider`. (EE controllers are always registered, so a no-license call returns 422, not 404.)

Consequences you MUST handle:

1. **Migrations/seeds must run with the license in scope.** The standard migrate/seed commands load only `.env.development`, which does NOT contain the license — it lives in `.env.development.local`. Always also pass `-e .env.development.local` (first, so it wins) or `hasEnterpriseLicense` is false and the EE migration directory is silently skipped.
2. **The shared base snapshot predates the license** — it's built core-only and shared with non-EE instances. After bootstrapping an EE instance from it, the DB has only core migrations. You MUST run an EE migration pass, or `/health` returns 500 (`Database has not been migrated yet`) because knex now resolves core + EE and sees the EE migrations as pending.
3. **Snapshot AFTER the EE migration pass** so `/docker-dev reset` restores EE-migrated state. The standard Auto-Snapshot step already runs after migrations — just ensure the EE pass happens first.
4. **Do NOT push EE state into the shared base.** Other instances may be non-EE and would see the EE tables / applied-out-of-list migrations. Leave `rebuild`'s shared-base refresh core-only.

Two feature-gating layers are independent: the **license** (`LIGHTDASH_LICENSE_KEY`) controls whether EE wiring + EE schema exist at all; individual **feature flags** (`LIGHTDASH_ENABLE_FEATURE_FLAGS`) gate features inside an EE service. EE setup here only handles the license — flip feature flags separately if a specific feature needs them.

### Step EE-1: Fetch the license key from 1Password

The key lives in the 1Password item **"Development Lightdash EE license key"**, in the `password` field (a JWT starting `eyJ...`). The item's notes confirm the env var is `LIGHTDASH_LICENSE_KEY`. Use ONLY this development item — never customer-named license items (confidentiality policy).

Append it to `.env.development.local` without echoing the secret:

```bash
printf 'LIGHTDASH_LICENSE_KEY=%s\n' \
  "$(op item get "Development Lightdash EE license key" --fields label=password --reveal 2>/dev/null)" \
  >> .env.development.local
# verify without revealing the key:
grep -q "^LIGHTDASH_LICENSE_KEY=eyJ" .env.development.local && echo "OK: license written" || echo "FAIL: license missing"
```

If `op` errors with a sign-in/auth failure, ask the user to run `! op signin` in the session, then retry.

### Step EE-2: EE migration + seed pass

Run **after** the env file has the license, and after bootstrap (or full migrate). The only difference from the standard commands is the extra `-e .env.development.local`:

```bash
# Apply core + EE migrations (license in scope → EE migration dir included)
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development.local -e .env.development -- pnpm -F backend migrate

# Confirm no pending migrations (this is what HealthService checks)
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development.local -e .env.development -- \
  pnpm -F backend exec knex migrate:status --knexfile src/knexfile.ts | tail -3   # expect "No Pending Migration files Found."
```

For seeds, the choice depends on the path:
- **Bootstrapped instance** (core already seeded): run ONLY the EE seed so you don't re-seed core data:
  ```bash
  PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development.local -e .env.development -- \
    pnpm -F backend exec knex seed:run --specific=01_embed.ts --knexfile src/knexfile.ts
  ```
- **Full setup** (first instance, empty schema): run the normal `pnpm -F backend seed` but with `-e .env.development.local -e .env.development` so core + EE seeds run together cleanly.

### Step EE-3: Verify EE is wired

```bash
curl -s -o /dev/null -w "health HTTP %{http_code}\n" "http://localhost:$PORT/api/v1/health"   # expect 200, not 500
pm2 logs "${LD_INSTANCE_ID}-api" --lines 200 --nostream 2>/dev/null \
  | grep -iE "Enterprise license.*valid|no factory or provider"
```

Expect `Enterprise license for <site> is valid.` and no `no factory or provider` lines.

### EE flow summary

`start ee` runs the normal `start` flow with these insertions: after **Create Environment File** → **Step EE-1**; after **Bootstrap** (or **Run Migrations**) → **Step EE-2**; then the existing **Auto-Snapshot** and **Start PM2**; finally **Step EE-3** to verify.

---

## `start`: Auto-detect and Setup

**ALWAYS try the deterministic fast path first.** Only fall back to the agentic steps when the script fails — this is what keeps worktree iteration fast.

### Step P: Instance profile selection (run BEFORE the fast path)

`start` provisions an instance for a set of *capabilities* (EE, AI agents, AI writeback, GitHub, reviews classifier, Slack). Each capability declares its feature flags, env, 1Password secrets, reconcile steps, and verification in `scripts/dev-profiles.json`. Resolve the selection, pull secrets from 1Password, write the env, **then** run the fast path. This is what removes the "re-explain the GitHub/writeback setup every time" friction — it's encoded, not recalled.

**1. Determine requested profiles.**
- If the user named them (e.g. `/docker-dev start ee`, `start ee,slack`, `start github`), use those. The AI tier is Core vs EE — `ee` bundles all AI features.
- If the user just ran `start` with no profile, show the menu and ask (multi-select):
  ```bash
  ./scripts/dev-profiles.sh list
  ```
  Present the labels via **AskUserQuestion** (multiSelect). Selecting nothing = a plain Core instance. Selecting **EE** transitively pulls in GitHub (so writeback is turnkey) and turns on every AI feature.

**2. Resolve the plan** (expands `requires` transitively, unions everything):
```bash
PLAN="$(./scripts/dev-profiles.sh resolve <comma,separated,names>)"   # JSON: {ee, secrets[], flags[], env{}, orgSettings{}, reconcile[], verify[]}
```

**3. Ensure the base env file exists** (ports block) so later writes don't lose the port reconciliation. If `.env.development.local` is absent, create it now from the **Create Environment File** template below (ports only — no secrets yet).

**4. Discover & confirm the 1Password item for each secret, then remember it.** Item names are NOT hardcoded — find the best match in *this engineer's own* vault and confirm:
```bash
./scripts/dev-op-pull.sh discover <PLAN.secrets...>   # JSON per secret: {saved, savedItem, confident, top, candidates[]}
```
For each secret not already `saved:true`: present `top` (recommended) plus the other `candidates` via **AskUserQuestion**, defaulting to the obvious *dev/development* item.
> ⚠️ Vaults contain other-org / customer items that fuzzy-match (license keys, API keys for clients). NEVER auto-pick, and never write a customer-named item into the env file, memory, a commit, or a PR — confirm the dev item with the user. (Confidentiality policy.)

On confirmation, persist the choice two ways so it's never asked again:
```bash
./scripts/dev-op-pull.sh save <SECRET_KEY> "<confirmed item name>"   # -> ~/.lightdash/dev-secrets.local.json (the scripts read this)
```
…and **record it in Claude memory** (the dev-env 1Password-sources memory): `env var → confirmed item name`, so the preference survives a fresh machine / lost local file. On future runs, skip the ask for any secret that's `saved:true` or already in memory. Shared items (license, GitHub App) are usually one unambiguous match — confirm once.

**5. Apply the plan.** Pull ALL secrets in **one** `pull` call — it signs in (Touch ID via desktop integration) and reads in the same invocation, because the `op` session does NOT carry across separate Bash calls. Run it yourself; only fall back to asking the user if it returns `FAIL: could not establish a 1Password session` (integration disabled).
```bash
./scripts/dev-op-pull.sh pull <PLAN.secrets...>          # self-signs-in, pulls into .env.development.local, verifies prefixes, never echoes values
# write PLAN.env (static, non-secret) — e.g. AI_COPILOT_ENABLED=true, AI_DEFAULT_PROVIDER=anthropic
./scripts/dev-feature-flags.sh enable <PLAN.flags joined by comma>   # merges into LIGHTDASH_ENABLE_FEATURE_FLAGS
```
> Do NOT split sign-in and pull across two Bash calls (the session is per-shell — the second call would report "not signed in"). `pull` handles both internally; if you must run `op` manually, chain it in one line: `op signin --account lightdash.1password.com && ./scripts/dev-op-pull.sh pull ...`.

**6. Feature-flag opt-in (scan + pick extras).** Beyond the profile's flags, let the user turn on any other flag that isn't already enabled:
```bash
./scripts/dev-feature-flags.sh scan          # TSV: value, ON/off, EnumName, description
```
Present the **disabled** flags (`./scripts/dev-feature-flags.sh list-disabled`) with their descriptions via **AskUserQuestion** (multiSelect, "which additional feature flags to enable?"). Then:
```bash
./scripts/dev-feature-flags.sh enable <selected,flags>
```
("Enabled" here means present in `LIGHTDASH_ENABLE_FEATURE_FLAGS` — that's what `FeatureFlagModel` resolves against. Code-level per-org/PostHog defaults aren't machine-readable, so the scan reports the local env state.)

**7. Run the fast path** (now the env has the license + secrets + flags, so EE auto-detects and the EE base is used):
```bash
./scripts/dev-fast-start.sh $( [ "$(echo "$PLAN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["ee"])')" = "True" ] && echo --ee )
```

**8. Post-start reconcile + verify** (after `READY:`) — **executable**, not hand-run crypto. First, if the GitHub account isn't known yet (first EE+github run), discover and remember it (same pattern as the secrets):
```bash
./scripts/dev-reconcile.sh list-accounts            # JSON of [{login, repos}] this App is installed on
# ask the user which login is theirs (AskUserQuestion), then:
./scripts/dev-reconcile.sh save-github-account <login>   # -> ~/.lightdash/dev-secrets.local.json
# and record it in Claude memory alongside the 1Password item prefs.
```
Then the reconcile steps:
```bash
./scripts/dev-reconcile.sh github-app-installation     # ensure github_app_installations decrypts with the running secret + points at a LIVE install (mints JWT, lists installs, re-encrypts, UPSERTs)
./scripts/dev-reconcile.sh github-dbt-repo             # check the project dbt_connection is github (repoint is guided if NEED)
./scripts/dev-reconcile.sh org-settings ai_agent_reviews_enabled=true   # PLAN.orgSettings
./scripts/dev-reconcile.sh verify-token               # PLAN.verify — mints an installation token (HTTP 201)
# or in one shot:
./scripts/dev-reconcile.sh all                        # installation -> dbt-repo-check -> verify-token
```
`dev-reconcile.sh` supplies the environment truths itself: the **running pm2 api's `LIGHTDASH_SECRET`** (the one the backend decrypts with — differs from the quote-wrapped env-file value), the PG connection from the claimed slot, and `pg`/crypto from the backend package (pnpm doesn't hoist `pg` to repo root). Map each `PLAN.reconcile` entry / `PLAN.orgSettings` / `PLAN.verify` to the calls above, then print a profile-aware **READY (writeback ✓ github ✓ reviews ✓ …)**. The *GitHub Integration & dbt Repo Setup* section explains each step and is the fallback when one reports `NEED` (e.g. a non-github dbt project to repoint).

> Fast path for a known profile: `/docker-dev start ee` does steps 1–8 with no menu (and skips the discover/ask for any secret already confirmed). The multi-select is only for discovery when no profile is named.

### Fast path (do this first, every time)

`scripts/dev-fast-start.sh` encodes the entire happy path of this section as one idempotent, non-interactive run. Run it directly instead of executing the steps below one at a time:

```bash
./scripts/dev-fast-start.sh          # core
./scripts/dev-fast-start.sh --ee     # EE mode (or if .env.development.local already has a license)
```

Interpreting the result:

- **Exit 0, ends with `READY: ...`** → done. Report the printed frontend/API/Spotlight URLs and start the **Monitor watchers** (see "Monitor Logs with Monitor Tool"). **Do not run any of the agentic steps below** — the environment is up.
- **Non-zero exit with a `FAIL: <step> -- <reason>` line** → enter **self-repair** (next section). Do NOT blindly re-run the script; diagnose first.

The script prints `STEP:`/`OK:`/`SKIP:` markers so you can see exactly how far it got. Steady-state runs (everything cached) finish in well under a minute; a fresh worktree pays for `pnpm install` + builds once.

### Self-repair protocol (when the script fails)

The `FAIL: <step> -- <reason>` line names the failing phase and usually the exact log command to inspect. Repair the **root cause**, then **patch the script so the same failure cannot recur** — that is how the fast path stays reliable as the codebase drifts.

1. **Identify the failing step** from the `FAIL:` line (e.g. `health`, `migrate`, `deps`, `pm2`, `bootstrap`, `ee-migrate`).
2. **Run the matching agentic step(s) below** to understand and fix the underlying problem (read logs, apply migrations, rebuild a package, free a port, etc.). The detailed steps in this file remain the source of truth for each phase.
3. **Patch `scripts/dev-fast-start.sh`** so the fix is baked in for next time — e.g. add a reconciling command, widen a readiness wait, handle a new required build artifact. Keep the script's contract intact: `STEP:`/`OK:`/`SKIP:`/`FAIL:` markers, idempotent, exit 0 only after `/api/v1/health` returns 200.
4. **Re-run `./scripts/dev-fast-start.sh`** to confirm it now reaches `READY:`.
5. Mention the script change in your summary so it can be committed — repairs are version-controlled and shared across worktrees, not re-derived per machine.

> Example: a stale shared base snapshot caused `FAIL: health -- ... Database has not been migrated yet`. The repair was an idempotent "Apply pending migrations" step after bootstrap; the script now reconciles drift automatically.

If the script is **missing** (e.g. an older checkout) or you suspect its logic is stale relative to this document, regenerate it from these agentic steps and the script contract above, then commit it.

### Agentic steps (fallback + first-instance reference)

Run State Detection first. For each `NEED:`, run the corresponding setup step below. If all checks show `OK:`, just start PM2.

**If EE mode** (see **Enterprise Edition (EE) Mode** above): after the env file is created, run **Step EE-1** (license), and after bootstrap/migrate run **Step EE-2** (EE migration + seed pass), then verify with **Step EE-3**.

### Start Docker Services

```bash
# Shared services (idempotent — safe if already running)
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d

# Per-instance PostgreSQL
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d
```

### Bootstrap from Shared Base Snapshot (fast path for new instances)

If this instance's database is empty (checks 6-8 show `NEED`) but a shared base snapshot exists, clone it instead of running full setup:

```bash
# Check if shared base snapshot exists
if docker volume inspect ld-shared_postgres_base >/dev/null 2>&1; then
  echo "Bootstrapping from shared base snapshot..."

  # Stop the db container
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev

  # Clone the shared base into this instance's volume
  docker run --rm \
    -v "ld-shared_postgres_base:/source:ro" \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
    alpine sh -c "rm -rf /target/* && cd /source && tar cf - . | (cd /target && tar xf -)"

  # Restart db
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev

  # Wait for postgres to be ready
  for i in $(seq 1 10); do
    docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres 2>/dev/null && break
    sleep 1
  done

  echo "Bootstrap complete — skipping migrations, seed, and dbt."
fi
```

**If the shared base snapshot does NOT exist**, this is the first instance — run the full setup (migrations, seed, dbt) below, then create the shared base snapshot at the end.

**After bootstrapping, skip directly to "Auto-Snapshot" and "Start PM2".**

> **EE mode:** the shared base is core-only, so a bootstrapped EE instance still needs an EE migration pass. After bootstrap, run **Step EE-2** (EE migration + seed pass) BEFORE the Auto-Snapshot, or `/health` will 500 on pending EE migrations.

### Create Environment File

```bash
cat > .env.development.local << EOF
# Local development overrides (instance: ${LD_INSTANCE_ID})
LD_INSTANCE_ID=${LD_INSTANCE_ID}
PGHOST=localhost
PGPORT=${LD_PG_PORT}
PORT=${PORT}
FE_PORT=${FE_PORT}
SCHEDULER_PORT=${SCHEDULER_PORT}
DEBUG_PORT=${DEBUG_PORT}
SDK_TEST_PORT=${SDK_TEST_PORT}
SPOTLIGHT_PORT=${SPOTLIGHT_PORT}
LIGHTDASH_PROMETHEUS_PORT=${LIGHTDASH_PROMETHEUS_PORT}
SITE_URL=http://localhost:${FE_PORT}
S3_ENDPOINT=http://localhost:9000
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=3001
INTERNAL_LIGHTDASH_HOST=http://localhost:${FE_PORT}

# Email - Mailpit (shared service, view emails at http://localhost:8025)
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USE_AUTH=false
EMAIL_SMTP_ALLOW_INVALID_CERT=true
EMAIL_SMTP_SENDER_NAME=Lightdash
EMAIL_SMTP_SENDER_EMAIL=noreply@lightdash.local

# Dev API access (auto-provisioned PAT from seed data)
LIGHTDASH_API_URL=http://localhost:${PORT}
LDPAT=ldpat_deadbeefdeadbeefdeadbeefdeadbeef
EOF
echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
```

> **EE mode:** now run **Step EE-1** to append `LIGHTDASH_LICENSE_KEY` from 1Password to this file, before any migrate/seed runs.

### Add Local Dev Instructions to CLAUDE.local.md

Append to `CLAUDE.local.md` (creates file if it doesn't exist):

````bash
cat >> CLAUDE.local.md << EOF
# Local Development Environment

## Starting Development Services

Start the Docker services before running the dev server:

\`\`\`bash
/docker-dev start
\`\`\`

### PM2 Commands

\`\`\`bash
pnpm pm2:start          # Start all services
pnpm pm2:logs           # Stream all logs
pm2 logs ${LD_INSTANCE_ID}-api --lines 50 --nostream  # View last 50 API lines
pnpm pm2:status         # Check process status
pm2 restart ${LD_INSTANCE_ID}-api       # Restart only the API server
pm2 restart ${LD_INSTANCE_ID}-scheduler # Restart only the scheduler
pm2 restart ${LD_INSTANCE_ID}-frontend  # Restart only the frontend
\`\`\`

### Picking up new env vars

\`pm2 restart --update-env\` only inherits env from the **current shell**, not from \`.env.development.local\`. The dotenv loader inside Node only runs at *spawn* time, so PM2's cached env wins on restart. After editing the env file:

\`\`\`bash
pm2 delete ${LD_INSTANCE_ID}-api && pnpm pm2:start   # reliable path
# or, set the var in the shell first:
# export FLAG=value && pm2 restart ${LD_INSTANCE_ID}-api --update-env
\`\`\`

Symptom if you forget: you change a flag, restart, and nothing changes. \`pm2 jlist\` will still show the old value.

## Debugging

Use the \`/debug-local\` skill for comprehensive debugging combining PM2 logs, Spotlight traces, and browser automation.

Spotlight UI: http://localhost:${SPOTLIGHT_PORT}

## Database Snapshots

\`\`\`bash
/docker-dev snapshot bug-repro-12345   # Save current db state
/docker-dev list-snapshots             # See all saved snapshots
/docker-dev restore bug-repro-12345    # Restore a named snapshot (~3s)
/docker-dev reset                      # Restore the default snapshot
\`\`\`

## Access the Application

- **Frontend**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${PORT}
- **Demo login**: \`demo@lightdash.com\` / \`demo_password!\`
- **Mailpit** (email inbox): http://localhost:8025
- **Spotlight** (traces): http://localhost:${SPOTLIGHT_PORT}

## Service Ports (this instance)

| Service           | Port      | URL                                |
| ----------------- | --------- | ---------------------------------- |
| Frontend (Vite)   | ${FE_PORT}      | http://localhost:${FE_PORT}              |
| Backend (Express) | ${PORT}      | http://localhost:${PORT}              |
| Scheduler         | ${SCHEDULER_PORT}      |                                    |
| PostgreSQL        | ${LD_PG_PORT}      |                                    |
| MinIO             | 9000/9001 |                                    |
| Headless Browser  | 3001      |                                    |
| Mailpit           | 8025/1025 | http://localhost:8025         |
| Spotlight         | ${SPOTLIGHT_PORT}      | http://localhost:${SPOTLIGHT_PORT}             |
EOF
````

### Ensure Correct Node Version

**CRITICAL: Always run this before `pnpm install` or starting PM2.** Native modules are compiled against the active Node ABI during `pnpm install`. If the wrong version is active, modules like `lz4` will crash with `ERR_DLOPEN_FAILED` at runtime.

Read the required version from `.nvmrc` or `.node-version`, then switch if needed:

```bash
REQUIRED_NODE=$(cat .nvmrc 2>/dev/null || cat .node-version 2>/dev/null || echo "")
CURRENT_NODE=$(node -v 2>/dev/null | sed 's/^v//')

if [ -n "$REQUIRED_NODE" ] && ! echo "$CURRENT_NODE" | grep -q "^${REQUIRED_NODE}"; then
  if [ -z "$CURRENT_NODE" ]; then
    echo "Node is not installed. Project requires Node $REQUIRED_NODE."
  else
    echo "Node version mismatch: running $CURRENT_NODE, project requires $REQUIRED_NODE"
  fi

  # Try fnm first
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
    fnm use "$REQUIRED_NODE" --install-if-missing
    echo "Switched to Node $(node -v) via fnm"

  # Try nvm
  elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use "$REQUIRED_NODE" || nvm install "$REQUIRED_NODE"
    echo "Switched to Node $(node -v) via nvm"

  # Try mise/rtx
  elif command -v mise >/dev/null 2>&1; then
    mise use "node@$REQUIRED_NODE"
    echo "Switched to Node $(node -v) via mise"

  else
    echo "ERROR: No Node version manager found. Install one to continue:"
    echo ""
    echo "  fnm (recommended, fast & simple):"
    echo "    curl -fsSL https://fnm.vercel.app/install | bash"
    echo ""
    echo "  nvm (widely used):"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash"
    echo ""
    echo "After installing, restart your shell and re-run /docker-dev start"
    return 1
  fi
fi
```

### Install Dependencies

Ensure [Socket Firewall Free](https://github.com/SocketDev/sfw-free) is available on the machine, then run the install through `sfw` so known-malicious packages are blocked at download time:

```bash
command -v sfw >/dev/null 2>&1 || npm i -g sfw
sfw pnpm install
pnpm -F common build && pnpm -F warehouses build && pnpm -F @lightdash/formula build
```

If `sfw pnpm install` fails with canvas errors: https://github.com/Automattic/node-canvas?tab=readme-ov-file#installation

### Set Up Python/dbt

The dbt venv is identical across worktrees, so `dev-fast-start.sh` builds it **once** in a shared cache (`~/.lightdash/dev-venv`) and symlinks each worktree's `./venv` at it — saving the pip install per worktree. Manual equivalent:

```bash
SHARED_VENV="$HOME/.lightdash/dev-venv"
if [ ! -f "$SHARED_VENV/bin/dbt" ]; then
  python3 -m venv "$SHARED_VENV"
  "$SHARED_VENV/bin/pip" install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
  ln -sf dbt "$SHARED_VENV/bin/dbt1.7"
fi
ln -s "$SHARED_VENV" venv   # only if ./venv doesn't already exist as a real venv
```

### Run Migrations (skip if bootstrapped)

```bash
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
```

> **EE mode:** add `-e .env.development.local` (first) so the license is in scope and the EE migration directory is included: `pnpx dotenv-cli -e .env.development.local -e .env.development -- pnpm -F backend migrate`. See **Step EE-2**.

### Seed Database (skip if bootstrapped)

```bash
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend seed
```

> **EE mode (full setup):** also pass `-e .env.development.local` so core + EE seeds run together on the empty schema.

### Build dbt Models (skip if bootstrapped)

```bash
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

### Create Shared Base Snapshot (first instance only)

After full setup completes (migrations + seed + dbt), create the shared base snapshot so future instances can bootstrap fast:

```bash
if ! docker volume inspect ld-shared_postgres_base >/dev/null 2>&1; then
  echo "Creating shared base snapshot for future instances..."
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
  docker volume create ld-shared_postgres_base
  docker run --rm \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
    -v "ld-shared_postgres_base:/snapshot" \
    alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
  echo "Shared base snapshot created."
fi
```

### Auto-Snapshot (per-instance)

After setup or bootstrap completes, take this instance's own snapshot for fast `/docker-dev reset`:

```bash
if ! docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
  docker volume create "${LD_VOLUME_PREFIX}_postgres_data_snapshot"
  docker run --rm \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
    -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot" \
    alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
fi
```

### Start PM2

If PM2 shows `MISMATCH`, delete this instance's processes first:

```bash
pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" "${LD_INSTANCE_ID}-frontend" "${LD_INSTANCE_ID}-common-watch" "${LD_INSTANCE_ID}-formula-watch" "${LD_INSTANCE_ID}-warehouses-watch" "${LD_INSTANCE_ID}-sdk-test" "${LD_INSTANCE_ID}-spotlight" 2>/dev/null || true
```

Then start:

```bash
pnpm pm2:start
```

### Monitor Logs with Monitor Tool

After PM2 is running, start **two persistent Monitor watchers** to stream backend and frontend errors in real-time. These run for the lifetime of the session — you'll be notified whenever an error or warning appears without needing to poll logs.

**Backend monitor** (API + scheduler errors/warnings):

Use the **Monitor tool** with:
- description: `Backend errors (API + scheduler)`
- persistent: `true`
- command:
```bash
pm2 logs "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" --raw 2>/dev/null | grep --line-buffered -E '(\[31m| error: |ERR!|unhandled|ECONNREFUSED|EADDRINUSE|crash|fatal|Cannot find module|TypeError:|ReferenceError:|SyntaxError:|DatabaseError)' | grep --line-buffered -v -E '(last [0-9]+ lines|TAILING|^$)'
```

**Filter design notes:**
- `\[31m` matches ANSI red (error-level log lines in raw pm2 output)
- ` error: ` (with spaces) matches the log-level field without catching `"0 errors"` in info messages
- `DatabaseError` catches migration/connection issues specifically
- The `-v` pipeline excludes pm2 metadata lines (TAILING headers, blank lines)

**Frontend monitor** (Vite build errors and warnings):

Use the **Monitor tool** with:
- description: `Frontend errors (Vite)`
- persistent: `true`
- command:
```bash
pm2 logs "${LD_INSTANCE_ID}-frontend" --raw 2>/dev/null | grep --line-buffered -E '(ERROR|ELIFECYCLE|✘|Build failed|Could not resolve|Failed to)' | grep --line-buffered -v -E '(last [0-9]+ lines|TAILING|^$)'
```

**Launch both monitors in parallel** (two Monitor tool calls in a single message). They filter for actionable signals only — not raw log streams — so you won't be overwhelmed.

If a monitor fires, investigate the error. Common responses:
- **EADDRINUSE**: Port conflict — run `./scripts/dev-ports.sh gc` then restart the process
- **Cannot find module**: Missing build — run `pnpm -F common build`
- **ECONNREFUSED on 5432**: PostgreSQL container down — restart with `docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml up -d`
- **TypeErrors/build failures**: Code issue — read the full log with `pm2 logs ${LD_INSTANCE_ID}-api --lines 50 --nostream`

**Instance-specific PM2 commands:**

| Command | Description |
|---------|-------------|
| `pm2 logs ${LD_INSTANCE_ID}-api` | Stream API logs |
| `pm2 restart ${LD_INSTANCE_ID}-api` | Restart API |
| `pm2 restart ${LD_INSTANCE_ID}-scheduler` | Restart scheduler |
| `pm2 restart ${LD_INSTANCE_ID}-frontend` | Restart frontend |
| `pnpm pm2:status` | All process status |

### Access the Application

- **Frontend**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${PORT}
- **Demo login**: `demo@lightdash.com` / `demo_password!`

---

## GitHub Integration & dbt Repo Setup

The common cases are **scripted** — `./scripts/dev-reconcile.sh {github-app-installation|github-dbt-repo|verify-token|all}` (called by Step P9). This section explains what those steps do and is the fallback when one reports `NEED` (e.g. a brand-new repo, or a non-github dbt project to repoint). Goal: a project whose dbt is connected over the dev GitHub App, so the agent can read the repo and writeback can open real PRs. The reconcile targets **your** GitHub account — set `githubAccount` in `~/.lightdash/dev-secrets.local.json` (or `GH_ACCOUNT`); without it the script picks the first `repos=all` installation and warns, which is wrong on the shared multi-install App.

**Environment truths the script encodes (don't relearn them by hand):**
- The decrypt secret is the **running pm2 api's `LIGHTDASH_SECRET`** (`pm2 jlist` → `pm2_env.LIGHTDASH_SECRET`), NOT the `.env.development` line — the file value is quote-wrapped, so dotenv's dequoted value differs by two `"` chars.
- `pg` is **not hoisted** to repo root under pnpm — require it from `packages/backend/node_modules` (or set `NODE_PATH`).
- `projects` is keyed by `organization_id` (int), not `organization_uuid`; `github_app_installations` and `ai_organization_settings` are keyed by `organization_uuid`.
- The `github/repos/list` and writeback routes need a **browser session cookie**, not the seeded PAT (its bcrypt hash ≠ the env placeholder) — so the script verifies via `verify-token` (mint an installation token) instead of `repos/list`.

**Preconditions.** The `GITHUB_*` env vars are set (Step P pulled them) and `GET /api/v1/health` shows `hasGithub:true` (it gates purely on `GITHUB_PRIVATE_KEY`). If false, the App creds didn't load — re-pull `GITHUB_APP` and restart the API.

**Step G1 — Ensure an installation row that decrypts with the RUNNING secret.**
`github_app_installations.encrypted_installation_id` is AES-256-GCM (salt[64]|tag[16]|iv[12]|msg; pbkdf2 sha512/2000/32) keyed by `LIGHTDASH_SECRET`. Two failure modes both surface as writeback errors:
- **Stale id** (decrypts, but the install no longer exists) → minting the token 404s (`Not Found — create-an-installation-access-token-for-an-app`).
- **Won't decrypt** (`Unsupported state or unable to authenticate data`) → the row was sealed with a *different* instance's secret (common after restoring another worktree's snapshot). Backend throws `Failed to decrypt installation id`.

Reconcile (idempotent):
1. Read the org uuid and whether a row exists/decrypts. **Use the secret the running API actually uses** — read `LIGHTDASH_SECRET` from `pm2 jlist` (`pm2_env.LIGHTDASH_SECRET`), NOT the raw `.env.development` line (the file value is quote-wrapped; dotenv strips the quotes, so they differ by the two `"` chars).
2. Mint a GitHub **App JWT** (RS256, `iss`=`GITHUB_APP_ID`, key = `Buffer.from(GITHUB_PRIVATE_KEY,'base64')`) and `GET https://api.github.com/app/installations` (authenticate as the *App*, not a user token). Pick the installation whose `account.login` is **your** GitHub account (`githubAccount`/`GH_ACCOUNT`) and owns the dbt repo you'll use (`repository_selection: all`). The id changes over time — never hardcode; always list.
3. Re-encrypt that id with the running secret and **UPSERT** the row (`organization_uuid`, `encrypted_installation_id`; on a fresh INSERT also set `created_by_user_uuid`/`updated_by_user_uuid` to the demo user and placeholder `auth_token`/`refresh_token` — they're `NOT NULL` but only affect PR authorship, never the token mint). Verify it decrypts back to the id.

**Step G2 — Point a project's dbt at a GitHub repo.** Writeback requires the project `dbt_connection.type` to be `github`/`gitlab`, pointing at a repo the installation covers. Check `GET /api/v1/projects/{uuid}` → `dbtConnection.{type,repository,branch,project_sub_path}`. If it isn't github (e.g. a `dbt`/local-file project), repoint it: re-encrypt a github dbt_connection (repo `<your-account>/<dbt-repo>`, e.g. a fork of the jaffle-shop dbt project, branch `main`, subpath `dbt`) with the **running** secret and UPDATE `projects.dbt_connection`. For a brand-new repo, first install the dev App (`lightdash-app-dev`) on that GitHub account/repo so an installation exists to find in G1.

**Step G3 — Verify.**
```bash
# token mints + repos visible (needs a browser session cookie, not a PAT):
curl -s -b <cookiejar> "http://localhost:$PORT/api/v1/github/repos/list" -o /dev/null -w "repos/list %{http_code}\n"   # expect 200
```
A 200 with the repo present confirms the App key works AND the installation id is correct. Then a writeback run should clone the repo, edit YAML, `lightdash compile`, and open a PR.

## Statusline: live web URL

While managing an instance's lifecycle, the Claude statusline shows this worktree's web app URL — **🟢 http://localhost:&lt;FE&gt;** when the frontend is up, **⚪ localhost:&lt;FE&gt;** when the slot is assigned but down, and nothing outside a Lightdash worktree. So `start`/`stop` are reflected at a glance without re-deriving the port.

How it's wired (composes with claude-hud — does not replace it):
- `scripts/dev-statusline.sh` (version-controlled) derives the instance from the cwd's git root → reads `~/.lightdash/dev-instances/<instance>.json` for `ports.frontend` → does one 0.3s TCP probe → prints claude-hud's `{"label":"…"}`.
- A global shim `~/.lightdash/dev-statusline-hud.sh` delegates to that repo script (falling back to a global copy `~/.lightdash/dev-statusline.sh` for worktrees that predate this script), so the logic stays in the repo.
- claude-hud runs it via `--extra-cmd`, appended to the `statusLine.command` in `~/.claude/settings.json`.

First-time install on a machine (idempotent):
```bash
mkdir -p ~/.lightdash
install -m755 scripts/dev-statusline.sh ~/.lightdash/dev-statusline.sh
cat > ~/.lightdash/dev-statusline-hud.sh <<'EOF'
#!/bin/sh
root=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$root" ] && [ -x "$root/scripts/dev-statusline.sh" ]; then exec "$root/scripts/dev-statusline.sh";
elif [ -x "$HOME/.lightdash/dev-statusline.sh" ]; then exec "$HOME/.lightdash/dev-statusline.sh"; fi
exit 0
EOF
chmod +x ~/.lightdash/dev-statusline-hud.sh
# append --extra-cmd to the existing statusLine command WITHOUT clobbering it (claude-hud or otherwise):
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.claude/settings.json")
d = json.load(open(p)); sl = d.get("statusLine")
if isinstance(sl, dict) and sl.get("type") == "command" and "--extra-cmd" not in sl["command"]:
    sl["command"] += ' --extra-cmd "$HOME/.lightdash/dev-statusline-hud.sh"'
    json.dump(d, open(p, "w"), indent=2); print("wired")
else:
    print("already wired or no command statusLine")
PY
```
Restart Claude Code to load the new `statusLine` command. If there's no command-type statusline yet, set `statusLine` to `{"type":"command","command":"$HOME/.lightdash/dev-statusline-hud.sh"}` for a bare URL-only line.

## `stop`: Stop This Instance

Stop this instance's services. Shared services and other instances are not affected.

```bash
pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" "${LD_INSTANCE_ID}-frontend" "${LD_INSTANCE_ID}-common-watch" "${LD_INSTANCE_ID}-formula-watch" "${LD_INSTANCE_ID}-warehouses-watch" "${LD_INSTANCE_ID}-sdk-test" "${LD_INSTANCE_ID}-spotlight" 2>/dev/null || true

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml down

./scripts/dev-ports.sh release
```

---

## `stop-all`: Stop Everything

Stop ALL instances, shared services, and release all port slots.

```bash
# Delete only Lightdash instance PM2 processes (not unrelated PM2 apps)
for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  INST_ID=$(python3 -c "import json; print(json.load(open('$f'))['instanceId'])")
  pm2 delete "${INST_ID}-api" "${INST_ID}-scheduler" "${INST_ID}-frontend" "${INST_ID}-common-watch" "${INST_ID}-formula-watch" "${INST_ID}-warehouses-watch" "${INST_ID}-sdk-test" "${INST_ID}-spotlight" 2>/dev/null || true
done

for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  PROJECT=$(python3 -c "import json; print(json.load(open('$f'))['composeProject'])")
  docker compose -p "$PROJECT" -f docker/docker-compose.dev.instance.yml down 2>/dev/null || true
done

docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml down

for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  rm "$f"
done

echo "All instances and shared services stopped."
```

---

## `reset`: Restore Database from Snapshot

```bash
if ! docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
  echo "ERROR: No snapshot found. Run /docker-dev start or /docker-dev rebuild first."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev

docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
  -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot:ro" \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres
```

---

## `rebuild`: Full Database Rebuild

Ensure env file, dependencies, and python/dbt are ready first (run pre-flight checks from `start`). Then:

```bash
# Remove instance snapshot (will be recreated after rebuild)
docker volume rm "${LD_VOLUME_PREFIX}_postgres_data_snapshot" 2>/dev/null || true

# Ensure Docker is running
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d

export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -c 'drop schema public cascade; create schema public;'

PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend seed

PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

> **EE mode:** add `-e .env.development.local` to BOTH the migrate and seed commands above so the EE migrations/seeds are included. Do NOT refresh the shared base from an EE rebuild (next step) — keep the shared base core-only for non-EE instances. See **Enterprise Edition (EE) Mode**.

After completion, take an instance snapshot (see "Auto-Snapshot" in `start`). Also update the shared base snapshot so future instances get the latest (**core-only instances only** — skip this for EE rebuilds):

```bash
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker volume rm ld-shared_postgres_base 2>/dev/null || true
docker volume create ld-shared_postgres_base
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
  -v "ld-shared_postgres_base:/snapshot" \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
```

---

## `snapshot [name]`: Save Database Snapshot

If no name provided, auto-generate from context (branch name, current work). Names must be alphanumeric with hyphens/underscores.

```bash
SNAPSHOT_NAME="<chosen-or-provided-name>"
if ! echo "$SNAPSHOT_NAME" | grep -qE '^[a-zA-Z0-9_-]+$'; then
  echo "ERROR: Invalid snapshot name."
  exit 1
fi

SNAPSHOT_VOLUME="${LD_VOLUME_PREFIX}_postgres_data_snapshot_${SNAPSHOT_NAME}"

if docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' already exists."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker volume create "$SNAPSHOT_VOLUME"
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
  -v "${SNAPSHOT_VOLUME}:/snapshot" \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
```

---

## `list-snapshots`

```bash
docker volume ls --format '{{.Name}}' | grep "^${LD_VOLUME_PREFIX}_postgres_data_snapshot_" | while read vol; do
  name="${vol#${LD_VOLUME_PREFIX}_postgres_data_snapshot_}"
  created=$(docker volume inspect "$vol" --format '{{.CreatedAt}}' | cut -d'T' -f1)
  size=$(docker run --rm -v "${vol}:/data" alpine du -sh /data 2>/dev/null | cut -f1)
  echo "  $name  (created: $created, size: $size)"
done
```

Also check if the default snapshot exists: `docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot"`

---

## `restore <name>`

```bash
SNAPSHOT_NAME="<name>"
SNAPSHOT_VOLUME="${LD_VOLUME_PREFIX}_postgres_data_snapshot_${SNAPSHOT_NAME}"

if ! docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' not found."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
  -v "${SNAPSHOT_VOLUME}:/snapshot:ro" \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres
```

---

## Troubleshooting

### PostgreSQL Connection Refused

```bash
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml ps
```

### MinIO Connection Refused

```bash
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps | grep minio
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d
```

### Port Conflicts

```bash
./scripts/dev-ports.sh list
./scripts/dev-ports.sh gc
./scripts/dev-ports.sh release && ./scripts/dev-ports.sh claim
```
