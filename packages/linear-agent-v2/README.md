# Linear agent v2

Flue-based internal coding agent PoC (successor to `linear-agent/`).

## Local setup

Local development needs a Linear AI app, a GitHub App, `.env`, exe.dev access,
and a public HTTPS tunnel to port `8790`.

### 1. Configure the Linear app

Create or edit the app at [Linear AI settings](https://linear.app/lightdash/settings/ai).
Configure:

- Callback URL: `https://gio.lightdash.dev/oauth/callback`
- Webhook URL: `https://gio.lightdash.dev/channels/linear/webhook`
- Webhook events: **Agent session events**

Copy the client ID, client secret, and webhook signing secret from that page.
If using another public hostname, replace `https://gio.lightdash.dev` everywhere,
including `PUBLIC_URL`, and allow the hostname in `vite.config.ts`.

### 2. Create `.env`

From `packages/linear-agent-v2`:

```bash
cp .env.example .env
```

Then fill in:

```bash
LINEAR_CLIENT_ID=...
LINEAR_CLIENT_SECRET=...
LINEAR_WEBHOOK_SECRET=...
PUBLIC_URL=https://gio.lightdash.dev

EXE_API_KEY=...
EXE_SSH_KEY=/absolute/path/to/a/passphrase-less/private/key
OPENAI_API_KEY=...

GITHUB_APP_ID=...
GITHUB_APP_INSTALLATION_ID=...
GITHUB_APP_PRIVATE_KEY=... # base64-encoded PEM
GITHUB_REPOSITORY=lightdash/lightdash
GITHUB_BASE_REF=main
```

Why each value is needed:

- `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`: OAuth installation, token
  exchange, and refresh.
- `LINEAR_WEBHOOK_SECRET`: verifies that agent-session webhooks came from Linear.
- `PUBLIC_URL`: builds the OAuth callback URL.
- `EXE_API_KEY`: clones, tags, shares, and deletes exe.dev VMs.
- `EXE_SSH_KEY`: logs into cloned VMs as `exedev` for agent tools, previews,
  and Git transfer. It must be passphrase-less because the background process
  cannot prompt. Authorize its public half with exe.dev; the app reads only the
  private key.
- `OPENAI_API_KEY`: authenticates the configured model.
- `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and
  `GITHUB_APP_PRIVATE_KEY`: mint short-lived, repository-scoped tokens used by
  the app-side PR broker. The private key is a single-line base64-encoded PEM.
- `GITHUB_REPOSITORY` and `GITHUB_BASE_REF`: select the publish target; both
  default to `lightdash/lightdash` and `main`.

To create a dedicated SSH key:

```bash
ssh-keygen -t ed25519 -N '' -f .ssh-key
chmod 600 .ssh-key
```

Register `.ssh-key.pub` with exe.dev. Keep `.ssh-key` local and never commit it.
Both `.env` and `.ssh-key*` are gitignored.

`LINEAR_ORGANIZATION_ID` and `LINEAR_WEBHOOK_ID` are optional webhook-delivery
pins.

### 3. Run the app and tunnel

```bash
pnpm dev
```

In another terminal, run any HTTPS tunnel that forwards the configured public
hostname to `http://localhost:8790`. Keep it running while Linear uses the app.
Verify it before delegating an issue:

```bash
curl https://gio.lightdash.dev/health
# {"status":"ok"}
```

### 4. Install the app once

With the app and tunnel running, visit:

```text
https://gio.lightdash.dev/oauth/authorize
```

Approve the Linear app. OAuth tokens are stored in gitignored
`data/tokens.json`. Then delegate a Linear issue to the app.

Commands below run from `packages/linear-agent-v2`. From the repository root,
use `pnpm --filter @lightdash/linear-agent-v2 <command>`.

## Linear webhook server

`pnpm dev` — Vite dev server on **:8790** (`src/app.ts`, Hono):

- `POST /channels/linear/webhook` — verified Linear ingress (`@flue/linear`
  channel, `src/channels/linear.ts`). `AgentSessionEvent` `created`/`prompted`
  → `dispatch(LinearCoder)` keyed by agent-session id (idempotent on
  `Linear-Delivery`), then `src/linear/relay.ts` streams the submission's
  chunks back as Linear activities: reasoning → `thought`, tool call →
  `action`; after settle, the app publishes a verified GitHub App commit and
  draft PR, then returns its link in the final `response`. The conversation's
  VM stays alive for follow-ups (see VM lifecycle below).
- `GET /oauth/authorize` → Linear consent (`actor=app`, scopes
  `read,write,app:assignable,app:mentionable`); `GET /oauth/callback` stores
  `{accessToken, refreshToken, expiresAt}` per org in `data/tokens.json`
  (`src/linear/tokens.ts`, auto-refresh 5 min before expiry).
- `GET /health`.

Conversations persist in `data/flue.db` (`src/db.ts`), so agent-session
follow-ups survive server restarts.

## CLI trigger

```bash
pnpm coder "Explain what packages/common is for"          # fresh conversation
pnpm coder "Now go deeper" --id my-conv                    # continue a conversation
PREVIEW=1 pnpm coder "Change the login page title"        # + publish a preview
PUBLISH=1 pnpm coder "Fix the typo in X"                  # + open a draft PR
PREVIEW=1 PUBLISH=1 LINEAR_ISSUE=PROD-123 pnpm coder "…"  # PR w/ preview + Closes line
```

`scripts/run.ts` wraps `flue run`: it loads `.env` and runs one submission.
The VM stays bound to the conversation for reuse (`--id` follow-ups land on
the same VM); the TTL sweeper reaps it later. With `PREVIEW=1` a Lightdash
preview is additionally published from the VM (see below).

## Preview pipeline

App-invoked after the submission settles (never by the agent — publishing
needs `EXE_API_KEY`, which must not reach the VM). Two pieces:

- `preview/start-preview.sh` — VM-side, credential-free port of v1
  `runner.sh start_preview`: dockerd, compose (pg/minio/mailpit), shared
  package builds, migrate+seed+dbt, pm2 api+frontend in **dev mode** (tsx +
  vite dev server with warmup config; scheduler not started), health check.
- `pnpm preview <vm> [host]` (`scripts/preview.ts`) — app-side: streams the bootstrap over SSH,
  then `share port <FE_PORT>` + `share set-public` via the exe.dev API, and
  verifies `https://<vm>.exe.xyz/login` returns 200. Prints `PREVIEW: <url>`.

Bootstrap takes ~4–6 min on a fresh clone. The preview VM stays alive until
the TTL sweeper reaps it.

## PR publish pipeline

App-invoked automatically after a Linear submission settles — the sandbox
never holds a GitHub credential. The agent commits its work in the sandbox
repo; `src/github/publish.ts` then:

1. Inspects the VM repo over SSH: base = `merge-base HEAD origin/main`, fails
   if no commits, warns on dirty tree (only committed work publishes).
2. Fetches the commits over SSH into a temporary bare repo and converts the
   committed diff into GitHub file changes.
3. Mints a short-lived GitHub App installation token, creates a temporary
   branch at the VM's base, and calls `createCommitOnBranch`. GitHub signs the
   commit; publishing stops unless the REST API reports a valid signature.
4. Moves `linear/<issue>-<vm-name>` to the verified commit and creates or
   updates its **draft PR**. Reruns are idempotent by branch.

`pnpm publish-pr <vm> [host]` invokes the same broker manually. The GitHub App
needs only Contents read/write and Pull requests read/write, installed only on
the target repository.

## Layout — what to edit

| Piece | File | How to change it |
|---|---|---|
| Agent prompt | `src/agents/linear-coder.prompt.md` | Edit the markdown. Next `flue run` picks it up — no build step. |
| Skills | `src/skills/<name>/SKILL.md` | Edit or add a directory with `SKILL.md` (frontmatter `name` must match dir name), import + `useSkill(...)` it in the agent. Edits to existing skills apply on next run. Repo conventions need no skill — the checkout's own `CLAUDE.md` covers them. |
| Model | `useModel(...)` in `src/agents/linear-coder.ts` | `provider/model` string, e.g. `openai/gpt-5.6-sol`. Auth via `OPENAI_API_KEY` in `.env`. |
| Sandbox | `src/sandboxes/exedev.ts` | Vendored Flue blueprint (`flue add sandbox exedev`) — don't hand-edit; re-add the blueprint to upgrade. Clone source + cwd are constants in `linear-coder.ts`. |

Prompt and skills are plain files: team members change agent behavior via
normal PRs, no Flue knowledge needed.

## Sandbox model & VM lifecycle

Sandboxes are clones of `ld-linear-agent-template` (jose-owned on the team —
`ls` won't show it, `cp` works) working in
`/opt/linear-agent-template/repository`, a full lightdash checkout. Clone →
SSH-able ≈ 2.5s.

**Per-conversation reuse** (`src/sandboxes/vm-store.ts`): the first submission
of a conversation clones a VM, tags it `ldlin-v2` (clones can't be named at
`cp` time), and binds it to the conversation id (`app_vm_bindings` table in
`data/flue.db`). Follow-ups reconnect to the bound VM — workspace state
survives between Linear prompts, and durability retries stop clone-storming.
A bound VM that's gone or SSH-dead is rm'd and replaced with a fresh clone.

**TTL sweeper** (`src/sandboxes/sweeper.ts`): every crash path leaks a clone,
so the sweeper reaps VMs tagged `ldlin-v2` whose last activity
(max of `created_at`, binding `last_used_at`) is older than `VM_TTL_HOURS`
(default 8). Runs hourly in the webhook server and on demand:

```bash
pnpm sweep                     # reap with configured TTL
pnpm sweep --ttl-hours 0       # reap everything tagged (careful)
pnpm sweep --dry-run           # report only
```

The template is never touched (untagged + name-guarded). Deterministic
deletion on Linear ticket close is not wired — Linear's agent-session webhook
only sends `created`/`prompted`; it would need Issue-entity webhooks + an
issue↔conversation mapping (future work; the sweeper bounds the leak window
meanwhile).
