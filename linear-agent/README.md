# Linear coding agent on exe.dev

This POC installs a custom Linear app user backed by isolated exe.dev VMs. Assign
an issue to the app or mention it, and the controller creates one runner VM for
that Linear Agent Session. Follow-up prompts reuse the same VM and Codex session.

## Architecture

```text
Linear AgentSession webhook
        │ signed HTTPS
        ▼
exe.dev controller VM ── copies/deletes ──► exe.dev runner VM
        │                                      ▲
        │                                      │ VM copy
        │                              golden runner template
        │                                      │
        │ Linear activities                    ├─ refreshes lightdash/lightdash
        │                                      ├─ runs codex exec
        │                                      ├─ starts Lightdash
        │                                      ├─ publishes port 3000
        │                                      └─ returns a Git patch
        ▼
draft GitHub PR (optional)
```

The runner receives only a job-scoped callback token and `CODEX_API_KEY`. The
Linear OAuth tokens, `EXE_API_KEY`, and optional `GITHUB_TOKEN` remain on the
controller. The controller applies returned patches without executing repository
code, then publishes an agent-owned draft branch and PR.

Linear's Agent APIs are a Developer Preview. The controller acknowledges signed
webhooks immediately, emits a thought before provisioning, and uses Agent
Activities for progress and results.

## 1. Create the Linear application

Create a private OAuth application in Linear and configure:

- Redirect URL: `https://ld-linear-agent.exe.xyz/oauth/callback`
- Webhook URL: `https://ld-linear-agent.exe.xyz/webhooks/linear`
- Webhook category: `AgentSessionEvent`
- OAuth scopes: `read`, `write`, `app:assignable`, `app:mentionable`

Save the client ID, client secret, and webhook signing secret. Linear installs
the app as an app user through `actor=app`.

References: [Linear agent setup](https://linear.app/developers/agents),
[agent interaction](https://linear.app/developers/agent-interaction), and
[webhook security](https://linear.app/developers/webhooks).

## 2. Configure secrets

```bash
cp linear-agent/.env.example linear-agent/.env
```

Fill in:

- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `LINEAR_WEBHOOK_SECRET`
- `CODEX_API_KEY` for non-interactive Codex
- `GITHUB_TOKEN` with access to create branches and PRs, if PR publishing is wanted

Export `EXE_API_KEY` in the deployment shell. Restrict it to the exe.dev commands
`ls,new,cp,rm,tag,share port,share set-public`; deployment writes it to the controller's protected environment
file and overrides any `EXE_API_KEY` value in the source file. The deployment
also uses your enrolled exe.dev SSH key to upload the controller and configure
its public proxy.

```bash
ssh exe.dev \
  "ssh-key generate-api-key --label=linear-agent-template --cmds='ls,new,cp,rm,tag,share port,share set-public' --exp=30d --json"
```

Do not commit `.env`. If `GITHUB_TOKEN` is omitted, completed patches remain on
the controller and Linear reports that no PR was published.

Codex runs with `--sandbox danger-full-access` only inside the dedicated runner
VM. The API key is provided only to each `codex exec` process, and Codex's shell
environment policy removes names containing `KEY`, `SECRET`, or `TOKEN` from
model-generated commands. No Linear, exe.dev, or GitHub credential enters the
runner VM.

Public previews use `demo@lightdash.com` / `demo_password!` and disable public
signup. Anyone with the runner URL can use those credentials until the VM
expires. Do not put production, license, or warehouse credentials in this POC.

## 3. Prepare the golden runner

Use a paid plan with enough pooled disk, set `EXE_RUNNER_DISK=25GB`, then build
the template once:

```bash
export EXE_API_KEY=...
./linear-agent/deploy-linear-exe-agent.sh prepare-template \
  linear-agent/.env
```

This creates `ld-linear-agent-template`, installs Node, pnpm dependencies,
Python 3.11, dbt 1.7 and 1.11, shared package builds, and the Browserless image
used for visual evidence. It also primes Vite's dependency cache, records the
Git commit and lockfile hash, and stops Docker before the VM is copied. Run the
same command again to refresh the template to the latest base branch. Rebuild
the VM explicitly when its resource sizing or system packages need to change:

```bash
./linear-agent/deploy-linear-exe-agent.sh prepare-template --replace \
  linear-agent/.env
```

The normal destroy command never selects the template.
Until the template exists, the controller retains a slower stock-VM fallback.
Copied runners start through a one-shot systemd service baked into the template;
the controller's HTTPS token is never copied into runner VMs.

## 4. Deploy the controller

```bash
export EXE_API_KEY=...
./linear-agent/deploy-linear-exe-agent.sh deploy linear-agent/.env
```

The deployment creates `ld-linear-agent`, installs the Node service, publishes
port 8787, and prints the OAuth installation URL. Open that URL as a Linear
workspace admin to install the app user.

```bash
./linear-agent/deploy-linear-exe-agent.sh status
./linear-agent/deploy-linear-exe-agent.sh logs
./linear-agent/deploy-linear-exe-agent.sh url
./linear-agent/deploy-linear-exe-agent.sh destroy
```

## Session behavior

On a `created` event, the controller responds to Linear before doing background
work, reports that provisioning started, and copies the golden template to
`ldlin-<session hash>`. The runner fetches and resets to the configured Git ref.
It reuses pnpm and dbt when the lockfile hash matches; a mismatch performs a
fresh filtered install before continuing. It invokes Codex non-interactively,
starts the core Lightdash preview with PostgreSQL, MinIO, and Mailpit, and warms
Vite's login and application-shell modules before verifying health through the
Vite proxy. Headless-browser and NATS services are outside this constrained POC
preview. Codex runs with JSONL output so reasoning summaries, commands, file
changes, MCP calls, web searches, and plan updates can be relayed as native
Linear `thought` and `action` activities while the implementation is running.
Command inputs and outputs are truncated and common credential patterns are
redacted before they leave the runner. The controller publishes runner port
3000, adds the preview URL to the Linear session, and receives the final response
plus a binary Git patch. The
implementation agent generates a semantic title such as
`fix(auth): enforce login attempt limits` and a short implementation summary.
The controller validates the title format before using it for both the commit
and draft pull request. Its final response is structured separately and rendered
in Linear as Markdown with implementation, validation, visual-evidence, and link
sections.

The controller retains patches and visual evidence, but removes temporary Git
checkouts and GitHub credential files after every publish attempt and on startup.

PR titles and descriptions describe behavior generically and must not include
client or customer names, organization names, or customer data examples. The
controller adds `Closes: <LINEAR-ID>` itself. It also reads GitHub issue links
from Linear attachments: links on the delegated ticket use `Closes: #<number>`,
while links inherited from a parent ticket use `Relates: #<number>`. The ticket
title and attachment titles are never copied into the PR description.

After the preview is healthy, a visual-evidence turn plans up to three targeted
screenshots. A short-lived Browserless container signs in to the seeded demo,
performs the specified UI actions, and captures the resulting state. The
controller serves those images from stable artifact URLs and adds them to the
draft PR under **Visual evidence**, alongside the summary and preview link. A
capture failure does not discard the implementation; the PR records the failure
instead of attaching a misleading generic screenshot.

On a `prompted` event, the prompt is queued for the existing runner and handled
with `codex exec resume --last`. Runner VMs expire after 24 hours by default.
Only names matching the exact `ldlin-<12 hex>` pattern can be deleted.

## Local verification

```bash
node --test linear-agent/core.test.mjs
node --check linear-agent/server.mjs
bash -n linear-agent/runner.sh
bash -n linear-agent/deploy-linear-exe-agent.sh
```

The end-to-end test requires a Linear OAuth application plus Codex and GitHub
API credentials. Delegate a sacrificial issue, verify the initial activity
appears within ten seconds, follow the controller logs, review the draft PR, send
a follow-up prompt, and confirm the same runner VM updates the PR.
