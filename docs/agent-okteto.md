# Coding agent development environments

Claude Code and other coding agents can use Okteto to create a complete
Lightdash development environment for a session. The workflow is opt-in: an
agent only starts it when the Lightdash-specific Okteto token variable is
configured. Engineers without that variable continue using the normal
development workflow.

Each opted-in session atomically claims a ready namespace from a shared pool, so
multiple tasks can run without overwriting one another. The namespace remains
claimed after the agent finishes so you can test the result.

The manifest uses the stable development environment name `lightdash` so pool
provisioning and agent synchronization update the same Okteto environment
record regardless of the checkout directory name.

The warm image is only a startup cache; the checked-out branch is the source of
truth. Before live editing begins, initial synchronization must reconcile the
development container with the files tracked by commits at the branch's
`HEAD`. Files that exist only in the warm image, including changes from a newer
`main`, must be removed from the container rather than copied into the
workspace, shown as untracked changes, or committed to the task branch. After
that reconciliation, edits made in the workspace continue to synchronize
normally.

## What you need

Ask a Lightdash administrator for the shared coding-agent Okteto token. This is
the only secret you need:

```text
LIGHTDASH_OKTETO_TOKEN=<shared automation token>
```

The token must belong to a dedicated, least-privileged Okteto account that can
create namespaces. It should have an expiration date and be rotated regularly.
Never commit it, paste it into a prompt, or add it to this repository's
`.claude/settings.json`.

The launcher gives each session an isolated Okteto and Kubernetes configuration
under the system temporary directory. It does not add the token to repository
files or logs and does not replace your normal local Okteto context.

Claude cloud environments do not provide a dedicated secrets store. Values
added to an environment are readable by anyone who can use that environment.
Only distribute this token to trusted Lightdash users and keep its Okteto
permissions narrow. See the
[Claude Code cloud environment documentation](https://code.claude.com/docs/en/cloud-environments).

## Claude Code on the web

Create or edit the Claude cloud environment you use for Lightdash.

### Environment variables

Add these values:

```text
LIGHTDASH_OKTETO_TOKEN=<shared automation token>
```

Changing environment variables only affects newly created sessions.

### Network access

Use custom network access, keep the default trusted domains enabled, and allow:

```text
downloads.okteto.com
dl.k8s.io
lightdash.okteto.dev
*.lightdash.okteto.dev
```

### Setup script

Use this setup script to install the versions expected by the Lightdash Okteto
environment:

```bash
#!/bin/bash
set -euo pipefail

OKTETO_VERSION=3.21.0
OKTETO_SHA256=f1fc644e2c2d2285a557577eafc6d4494410dce17b36bac6c3c269fc04c573ef
KUBECTL_VERSION=v1.35.0

curl -sSfL \
  "https://downloads.okteto.com/cli/stable/${OKTETO_VERSION}/okteto-Linux-x86_64" \
  -o /tmp/okteto
echo "${OKTETO_SHA256}  /tmp/okteto" | sha256sum --check
install -m 0755 /tmp/okteto /usr/local/bin/okteto

curl -sSfL \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
  -o /tmp/kubectl
curl -sSfL \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256" \
  -o /tmp/kubectl.sha256
echo "$(cat /tmp/kubectl.sha256)  /tmp/kubectl" | sha256sum --check
install -m 0755 /tmp/kubectl /usr/local/bin/kubectl

command -v tmux >/dev/null || {
  apt-get update
  apt-get install -y tmux
}
```

Start a new Claude Code session after saving the environment. Before processing
the first prompt, Claude claims a ready Okteto namespace, starts file
synchronization, waits for 100% synchronization, and waits for the Lightdash
health endpoint.

### How the Claude hook works

The `SessionStart` hook in `.claude/settings.json` runs on new, resumed,
cleared, compacted, and forked Claude sessions. It has an explicit 1800-second
timeout for the cold fallback path. Claude sends session metadata to the hook
over standard input and provides `CLAUDE_ENV_FILE` for variables that should
remain available to later shell commands.

One hook invocation copies Claude's `session_id` into
`LIGHTDASH_AGENT_SESSION_ID` through `CLAUDE_ENV_FILE`, claims or reuses a
namespace, starts `okteto up` in tmux, and waits until synchronization and
application health are stable. Its `READY:` output is added to Claude's
SessionStart context. `BASH_MAX_TIMEOUT_MS` does not control hook execution;
the timeout is set directly on the hook.

The internal startup deadline is 1700 seconds, leaving time for the hook to
surface a clean failure before the 1800-second SessionStart timeout.

`start` claims an unclaimed, healthy pooled namespace and runs `okteto up`
against its existing deployment. If the pool is temporarily exhausted, it
falls back to creating and deploying a session-specific namespace.

SessionStart exit codes do not block Claude. The hook therefore returns
structured `continue: false` output when setup fails. A fast
`UserPromptSubmit` guard also rejects prompts unless the startup gate recorded
readiness, covering hook cancellation or timeout. It distinguishes an active
startup from a failed startup and reports the recorded failure. A `Stop` hook
verifies synchronization and health again and requires the ready URL in
Claude's final response.

All hooks return immediately without output when `LIGHTDASH_OKTETO_TOKEN` is
unset.

## Other coding agents

Make the same `LIGHTDASH_OKTETO_TOKEN` variable available to the agent process
and install Okteto, `kubectl`, `jq`, and `tmux` in its environment. Agents use
`LIGHTDASH_AGENT_SESSION_ID` when their platform provides one; otherwise the
launcher derives a stable identity from the current workspace.

## Local Claude Code

Install the required tools on macOS:

```bash
brew install okteto tmux kubectl jq
```

Make `LIGHTDASH_OKTETO_TOKEN` available to the process that launches Claude
Code. For example, retrieve it from your team's password manager and export it
in the terminal immediately before starting Claude:

```bash
export LIGHTDASH_OKTETO_TOKEN='<shared automation token>'
claude
```

Do not put the token in a repository file. If your shell configuration is
shared or backed up, use your password manager's CLI or another local secret
manager rather than saving the token there.

## What Okteto administrators configure

End users do not need the Lightdash application secrets. Okteto administrators
must configure these variables for the cluster:

- `LIGHTDASH_LICENSE_KEY`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`

The launcher defaults to `https://lightdash.okteto.dev`. Administrators can
override it for testing with the non-secret `OKTETO_CONTEXT` environment
variable.

## Ready environment pool

The `Agent Okteto Pool` GitHub Actions workflow runs every 30 minutes and can
also be started manually. It keeps at least three unclaimed namespaces deployed
and healthy. Pooled namespaces use short sequential names such as `dev-warm-1`.
Configure these GitHub Actions secrets:

```text
LIGHTDASH_OKTETO_TOKEN=<shared automation token>
OKTETO_CONTEXT=https://lightdash.okteto.dev
```

The maintainer runs the baked development image in the idle `lightdash-dev`
pod, then records its immutable digest after the base pods and public ingress
are available. An agent claims it by atomically creating the
`lightdash-agent-claim` ConfigMap with its session hash. Kubernetes allows only
one creation to succeed, preventing two simultaneous sessions from selecting
the same namespace. The claim also records the prepared digest, and `okteto up`
uses that exact image instead of resolving the mutable `latest` tag. After
`okteto up`, the launcher waits for file
synchronization and `/api/v1/health`. Claimed namespaces are excluded when the
workflow replenishes the pool. The same hash is available inside the
development container as `LIGHTDASH_AGENT_SESSION_HASH`.

After `Dev Warm Image` publishes a new image, it refreshes unclaimed pool
namespaces and records the new digest. It never restarts claimed namespaces.
Both the image workflow and pool workflow support manual `workflow_dispatch`
runs.

If no warm namespace is available, the launcher creates an on-demand namespace
named `dev-cold-<8-character-session-hash>`.

The workflow uses `scripts/maintain-agent-okteto-pool.sh`. Run it manually with
the desired minimum pool size when testing administrator changes:

```bash
./scripts/maintain-agent-okteto-pool.sh 3
```

## Manual testing

The agent verifies synchronization and health again before its final response,
which includes a URL like:

```text
https://<deployment>-dev-warm-<number>.lightdash.okteto.dev
```

An on-demand fallback URL contains `dev-cold-<session-hash>` instead.

Use these credentials:

```text
Email: demo@lightdash.com
Password: demo_password!
```

If startup fails, Claude stops before working on the request. Follow the setup
error, replace expired tokens or fix missing tools, and then resume the session.

Okteto recommends a separate namespace for each autonomous run to prevent
parallel branches from colliding. See
[Okteto's autonomous workflow guidance](https://www.okteto.com/docs/agentic/autonomous-workflows/).
