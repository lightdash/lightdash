## Lightdash CLI

Lightdash CLI tool

## How to install

`npm i -g @lightdash/cli`

## Usage

```
Usage: lightdash [options] [command]

Options:
  -h, --help      display help for command

Commands:
  agent connect   connect your agent to the warehouse through browser sign-in
  agent status    show your agent connection status
  version         output the version number
  [dbt_command]   runs dbt
  help [command]  display help for command
```

eg: `ligthdash test` Runs `dbt test`

## Agent connection

### Warehouse sign-in

Bare `agent connect` and unnamed, unselected `agent status` use your saved
personal CLI login for warehouse sign-in:

```shell
lightdash agent connect --project my-project
lightdash agent status --project my-project
```

Both commands accept a project UUID or slug. If you omit `--project`, they use
your saved project. Select one with `lightdash config set-project`.

`agent connect` opens a browser and prints the sign-in link for manual use.
Use `--oauth-port <port>` to choose the local callback port, or set
`LIGHTDASH_OAUTH_PORT`. Otherwise, the CLI selects an available port.
`--timeout <seconds>` defaults to 180. After that wait, the CLI checks the
connection every 3 seconds for up to another 120 seconds. Both commands accept
`--verbose` and exit with code 1 if the connection is refused or incomplete.

### Scoped CLI credentials

An agent connection limits the projects and actions available to requests that use
its credential. Programs the CLI starts run as your computer user and can still
read your files, including your saved personal API key and connection tokens.
Removing the API key from those programs' environment helps avoid accidental use
or exposure; it does not isolate those programs from your account or files.

`agent connect --connection` (or a connection option such as `--name`) requests
an agent connection. Approval is review-only today: it creates no connection,
code or token. The CLI's issuer contract is exercised against a test double;
[real issuer evidence is still needed](../../docs/agent-identity/issuer-contract.md#evidence-still-needed-from-the-real-issuer).

For a saved connection, `--agent-connection <slot>` or
`LIGHTDASH_AGENT_CONNECTION` selects its credential. Selected requests do not
fall back to the personal API key if the connection is missing or invalid.
`agent status --name <slot>` reports that connection;
[CLI revocation and recovery](../../docs/agent-identity/revocation.md#cli-revocation-and-recovery)
use `agent revoke --name <slot>` and its `--human` option.

When a connection is selected, the CLI removes exactly one variable from a
program's environment: `LIGHTDASH_API_KEY`. It keeps the rest, including
`LIGHTDASH_PROXY_AUTHORIZATION`, and passes the selected slot as
`LIGHTDASH_AGENT_CONNECTION`. Command-specific environment overrides still
apply. The CLI does not put the connection's saved access or refresh token into
that environment. It does not remove credentials already present under other
variable names or clear the parent CLI's environment.

The CLI config is `~/.config/lightdash/config.yaml`; saved connections are in
`~/.config/lightdash/agent-connections.yaml`. Both are readable YAML text,
including the saved personal API key and connection tokens. On POSIX systems,
the CLI uses owner-only permissions: directories `0700`, files `0600`.
A program running as your computer user can open them. On Windows, access
depends on the operating system's ACLs; the CLI skips POSIX permission changes.

## Project validation

`lightdash validate` checks existing project content against locally compiled
models. Data apps are included by default, or use `--only apps` to check only
their stored data references:

```shell
lightdash validate --profiles-dir ../profiles/ --select path:models/marts --only apps
```

With `--select`, `--models`, `--exclude`, or `--selector`, data apps are checked
against the compiled selection. App references to models outside that selection
fail validation, as do broken references within it. The command exits non-zero
on errors. It does not fall back to a full-project compile or require additional
warehouse access for app validation.

## AI agents as code

AI-agent project configuration can be downloaded into
`lightdash/ai-agents/<slug>.yml` and applied to another project:

```shell
lightdash download --include-agents
lightdash upload
```

Use `--agents <slugs...>` on either command to select specific agents. The
files manage the agent name, description, image URL, instructions, semantic
tags, data/content/user-context flags, self-improvement flag, model config,
and evaluation suites. Evaluation suites are upserted by title; suites omitted
from YAML remain unchanged, and evaluation run history is never downloaded.
The YAML `version` identifies the as-code schema, while `agentVersion` preserves
the AI agent runtime version.
Access lists, Slack integrations, MCP servers, documents, conversations, and
other runtime state stay managed in the target environment.

## Data apps as code

Create a new data app locally from the same starter used by Lightdash's data
app builder:

```shell
lightdash apps create "Revenue explorer"
```

This requires npm. Before writing anything, the command first warns that it
will download packages and run shadcn locally, then asks whether to show and
approve the exact direct dependencies and shadcn components. It creates
`lightdash/apps/revenue-explorer/` with runnable source, the
Lightdash data app and local-development agent skills, and a point-in-time
snapshot of the selected project's semantic layer. Use `--project`, `--slug`,
`--description`, or `--path` to override the defaults; use `--assume-yes` to
approve installation in a non-interactive environment.

Build and upload it with:

```shell
cd lightdash/apps/revenue-explorer
lightdash apps validate --live --build
lightdash upload --apps revenue-explorer
```

`lightdash apps validate [paths...]` checks app source, manifests,
dependencies, external-connection aliases, and semantic references. It uses
the downloaded semantic-layer snapshot by default; `--live` fetches the
project's current explores, and `--format json` provides CI output. Add
`--build` to run the same bare Vite production build as Lightdash Cloud against
the CLI's vendored template. Standard apps need `npm install` to have populated
`node_modules`; custom dependencies are restored with `pnpm install` using
`--frozen-lockfile --ignore-scripts` first. Build failures include the Vite
output and make validation exit non-zero.

The local build is a pre-flight check; Lightdash rebuilds the source when it is
uploaded. Existing apps can still be checked out with
`lightdash download --apps <slug>`.

## Development

First build the package

```shell
pnpm cli-build
```

Then run the cli commands with `node` and pointing to the `dist/index.js` file

### Examples from lightdash root folder

Lightdash login

```
node ./packages/cli/dist/index.js login http://localhost:3000
```

Lightdash compile

```
node ./packages/cli/dist/index.js deploy --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles --use-batched-deploy
```

Lightdash generate

```
node ./packages/cli/dist/index.js generate --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

Lightdash preview

```
node ./packages/cli/dist/index.js preview --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
```

Lightdash run

```
node ./packages/cli/dist/index.js dbt run --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles -s
```

### Testing different dbt versions

If you want to test different dbt versions, you can replace the string `dbt` in the "execa" calls in the package with `dbt${YOUR_VERSION}`, eg: `dbt1.8`.

## Automation, CI & Agentic Usage

The CLI supports non-interactive usage for CI/CD pipelines and agentic LLM coding tools (Claude Code, Cursor, Windsurf, etc.).

The `--non-interactive` flag is designed for environments where interactive prompts would block execution, such as automated pipelines or when an AI coding agent is running CLI commands on your behalf.

### Global Options

| Flag                | Description                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--non-interactive` | Disable all interactive prompts. Commands auto-select defaults where possible. Designed for CI/CD and agentic coding tools. |

### Command-Specific Options

| Command    | Flag               | Description                                              |
| ---------- | ------------------ | -------------------------------------------------------- |
| `login`    | `--token <token>`  | Authenticate with personal access token (bypasses OAuth) |
| `login`    | `--email <email>`  | Login with email and password                            |
| `login`    | `--project <uuid>` | Select a specific project by UUID after login            |
| `deploy`   | `-y, --assume-yes` | Answer yes to all confirmation prompts                   |
| `generate` | `-y, --assume-yes` | Answer yes to prompts                                    |
| `dbt run`  | `-y, --assume-yes` | Answer yes to prompts                                    |
| `rename`   | `-y, --assume-yes` | Answer yes to prompts                                    |

### Environment Variables

| Variable            | Description                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `CI=true`           | Equivalent to `--non-interactive`                                                                |
| `LIGHTDASH_API_KEY` | API token for authentication (can be used instead of `--token`)                                  |
| `LIGHTDASH_PROJECT` | Target project UUID; overrides the saved default and active preview unless `--project` is passed |

For project selection in commands such as `deploy`, `download`, and `upload`,
`--project` takes precedence over `LIGHTDASH_PROJECT`. Either override bypasses
active-preview selection in both interactive and non-interactive runs, without
clearing the saved preview. When `LIGHTDASH_PROJECT` overrides an active preview
the CLI warns which preview it ignored, so a variable left in a shell profile or
`.env` does not silently redirect commands you meant to run against the preview.
If neither override is set (or `LIGHTDASH_PROJECT` is empty), an active preview
remains the default in non-interactive runs; interactive runs prompt when both a
default project and a preview are available.

```bash
LIGHTDASH_PROJECT=<target-project-uuid> lightdash deploy --non-interactive
```

With no agent connection selected, credentials resolve in the usual order: command flags, then environment variables, then the config file written by `lightdash login`. So a `LIGHTDASH_API_KEY` left in your shell profile is used ahead of your saved login — `lightdash login` warns when this is the case, and `unset LIGHTDASH_API_KEY` restores the saved token.

For a selected connection, see [Scoped CLI credentials](#scoped-cli-credentials)
for credential selection and local program access.

### Example Automation Scripts

```bash
# Login with token (auto-selects first project in non-interactive mode)
lightdash login https://app.lightdash.cloud \
  --token $LIGHTDASH_API_KEY \
  --non-interactive

# Login with token and specific project
lightdash login https://app.lightdash.cloud \
  --token $LIGHTDASH_API_KEY \
  --project abc-123-uuid \
  --non-interactive

# Login with email/password
# Option 1: Use environment variables (recommended - avoids shell history)
export LIGHTDASH_CLI_EMAIL=demo@lightdash.com
export LIGHTDASH_CLI_PASSWORD='your_password'
lightdash login http://localhost:3000

# Option 2: Interactive password prompt (password not in shell history)
lightdash login http://localhost:3000 --email demo@lightdash.com
# You will be prompted to enter your password securely

# Deploy to existing project non-interactively
lightdash deploy \
  --project-dir ./dbt \
  --profiles-dir ./profiles \
  --non-interactive

# Create new project non-interactively
lightdash deploy \
  --create "My New Project" \
  --assume-yes \
  --non-interactive \
  --project-dir ./dbt \
  --profiles-dir ./profiles
```

### Behavior in Non-Interactive Mode

When `--non-interactive` is set (or `CI=true`):

- **Project selection**: Automatically selects the first available project
- **Confirmation prompts**: Fail with descriptive error unless `--assume-yes` is provided
- **OAuth login**: Not available - use `--token` or `--email` with `LIGHTDASH_CLI_PASSWORD` env var instead

### Email/Password Login

You can use email/password authentication with the CLI:

```bash
# Option 1: Environment variables (recommended)
export LIGHTDASH_CLI_EMAIL=demo@lightdash.com
export LIGHTDASH_CLI_PASSWORD='your_password'
lightdash login http://localhost:3000

# Option 2: Interactive password prompt
lightdash login http://localhost:3000 --email demo@lightdash.com
# Password will be prompted securely (not visible in shell history)
```

**Note**: For production CI/CD pipelines, consider using `--token` with a personal access token instead.

### Claude Code / Agentic Tools: Passwords with Special Characters

When using Claude Code or similar agentic coding tools, passwords containing special characters like `!` will fail with "Email and password not recognized" even when the credentials are correct.

**Why this happens**: Characters like `!` have special meaning in bash (history expansion). Even with single quotes, some shells still interpret them, causing the password to be mangled before it reaches the CLI.

**Solution**: Write the password to a file using a heredoc, which treats content as completely literal:

```bash
# Write password to file using heredoc (bypasses all shell escaping)
cat > /tmp/lightdash_pass.txt << 'EOF'
your_password_with_special_chars!
EOF

# Set environment variables from the file
export LIGHTDASH_CLI_EMAIL=demo@lightdash.com
export LIGHTDASH_CLI_PASSWORD=$(cat /tmp/lightdash_pass.txt)

# Login using environment variables
lightdash login http://localhost:3000 --non-interactive

# Clean up
rm /tmp/lightdash_pass.txt
```

**Important**: The `<< 'EOF'` syntax (with quotes around EOF) is critical - it prevents any shell interpretation of the content.

The CLI supports these environment variables for authentication:

| Variable                 | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `LIGHTDASH_CLI_EMAIL`    | Email for login (alternative to `--email`)     |
| `LIGHTDASH_CLI_PASSWORD` | Password for email login (used with `--email`) |

### Instance URLs and proxies for agent connections

Configure the final public HTTPS URL, including the deployment path prefix.
For example, use `https://example.com/tools/lightdash` if that is the public
address. For local development, HTTP is accepted on `localhost`, `127.0.0.1` or
`[::1]`. For the connection's identity and its API requests, one trailing slash
is the same as none.

Every instance API request made with a connection keeps the prefix and stays
inside `<instance>/api/`. This also applies to credential-bearing steps during
approval, token exchange, verification, refresh, status checks and revocation,
including personal recovery with `agent revoke --name <slot> --human`.
The CLI refuses all HTTP redirects on these requests, including redirects to
the same origin or to add a trailing slash. Configure the final address directly;
the proxy must serve the API paths without a redirect. A proxy can rewrite the
prefix internally while the CLI continues to use the public address.

The CLI builds approval and settings links from the configured instance URL.
Without a usable saved connection, a settings link is the configured URL as
written with the path added.
This API rule does not cover public asset downloads (`install-skills`,
`upgrade-check` or an explicit external manifest), browser sign-in navigation,
or the local callback listener. Public downloads carry no connection credential;
the CLI does not supply its credential or proxy authorization header to the
browser.

`lightdash login <url>` removes a path from the URL. Set `LIGHTDASH_URL` or the
saved config to preserve a deployment prefix for connections. Ordinary instance
API requests still use root `/api/...` paths, even with a prefix in the environment
or config. A proxy must also make the root API paths work for ordinary commands.
Some displayed links keep the prefix. The connection rule does not change
ordinary command behaviour.

### Connection errors and credential output

On the agent connection commands, and when a request made with a connection fails,
the CLI prints fixed messages and no server-written text. The CLI never prints a
credential on purpose. Data that a command exists to show is shown as received.

The connection forms are `agent connect --connection` (or a connection option
such as `--name`), `agent status --name <slot>` (or a selected connection), and
`agent revoke --name <slot>`. Bare `agent connect` and unnamed, unselected
`agent status` use the older personal flow.
Failures include an error status, an error envelope on HTTP 200, an unreadable or
aborted body, and a redirect. Known error codes select fixed messages; unknown
codes are omitted. Links use the configured instance and fixed paths and query
fields. The approval link contains a validated request UUID.

An error the CLI raises while using data from a successful answer can quote that
data (for example a slug or a file path). Two known cases with a connection:
`download --spaces-only` names a space slug the server returned twice, and
`download` names the file path built from a chart slug when that file cannot be
written.

Connection success reports show the person's project names, UUIDs, approved and
effective actions, connection states and timestamps, and warehouse readiness.
In these connection reports, project names have ANSI escapes and C0/C1 control
characters removed; other server-supplied report fields are validated UUIDs,
timestamps, booleans or fixed enums. Report fields the CLI does not know are
not saved.

Successful catalogue names and types, query results, downloaded content and
project names in ordinary listings retain the server's characters, including
control characters.

The CLI has no general screen that rewrites its output.

For local program and file access, see [Scoped CLI credentials](#scoped-cli-credentials).
