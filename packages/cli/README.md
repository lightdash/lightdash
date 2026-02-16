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
  version         output the version number
  [dbt_command]   runs dbt
  help [command]  display help for command
```

eg: `ligthdash test` Runs `dbt test`

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
node ./packages/cli/dist/index.js compile --project-dir ./examples/full-jaffle-shop-demo/dbt --profiles-dir ./examples/full-jaffle-shop-demo/profiles
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

| Flag | Description |
|------|-------------|
| `--non-interactive` | Disable all interactive prompts. Commands auto-select defaults where possible. Designed for CI/CD and agentic coding tools. |

### Command-Specific Options

| Command | Flag | Description |
|---------|------|-------------|
| `login` | `--token <token>` | Authenticate with personal access token (bypasses OAuth) |
| `login` | `--email <email>` | Login with email and password |
| `login` | `--project <uuid>` | Select a specific project by UUID after login |
| `deploy` | `-y, --assume-yes` | Answer yes to all confirmation prompts |
| `generate` | `-y, --assume-yes` | Answer yes to prompts |
| `dbt run` | `-y, --assume-yes` | Answer yes to prompts |
| `rename` | `-y, --assume-yes` | Answer yes to prompts |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CI=true` | Equivalent to `--non-interactive` |
| `LIGHTDASH_API_KEY` | API token for authentication (can be used instead of `--token`) |

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

| Variable | Description |
|----------|-------------|
| `LIGHTDASH_CLI_EMAIL` | Email for login (alternative to `--email`) |
| `LIGHTDASH_CLI_PASSWORD` | Password for email login (used with `--email`) |
