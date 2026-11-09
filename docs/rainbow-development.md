# Developing on Rainbow

Rainbow Machine runs a preview environment for each pull request. Use it to run, test and demo a branch. `rainbow.toml` at the repo root is the recipe: services, datastores, env vars, secrets and egress. For a local instance, follow [Setup Development Environment without Docker](../.github/CONTRIBUTING.md#setup-development-environment-without-docker).

## Get an environment

1. Push your branch to `lightdash/lightdash`.
2. Open a pull request.
3. Wait for the `rainbow-machine/preview` commit status on the head commit.
4. Open `https://lightdash--pr-<N>.lightdash.rainbowmachine.dev`, where `<N>` is the pull request number.

Each push to the branch updates the same environment at the same URL. Change code through git only: the app directory in the environment (`/usr/app`) is not a git checkout. Changes to `frontend`, `common`, `visualization` or `formula` rebuild the frontend bundle, so they take longer than backend changes.

## Sign in

- Sign in as the seed admin: `demo@lightdash.com` / `demo_password!`.
- The email passcode is `000000`. Environments run in PR mode (`LIGHTDASH_MODE = "pr"`).
- For the API, use the seed personal access token (`SEED_PAT` in `packages/common/src/index.ts`).
- The seed organization has test data only: the Jaffle shop project with its charts and dashboards.
- To turn feature flags on or off, use the API in [preview-feature-flags.md](preview-feature-flags.md).

## What runs

- `dev` runs `pnpm dev`. The backend listens on 8080 and serves the prebuilt frontend bundle.
- `snowflake-ai-stub` is the Snowflake AI stub that the API tests use.
- The datastores are Postgres, MinIO and Mailpit.
- The backend stores files in the in-environment MinIO, unless the `S3_*` secrets are stored.
- The backend sends mail to the in-environment Mailpit (`EMAIL_SMTP_HOST = "localhost"`, port 1025).
- Non-secret settings are in the `[env]` table.
- Secret names are in the `[secrets]` table. The platform holds the values. A secret with no stored value is absent, and its feature stays off.
- An outbound call fails unless its host is in an `[[egress.allow]]` entry.

## Agents

Agents use the `rainbow-env` skill (`.agents/skills/rainbow-env/SKILL.md`). It covers how to create or redeploy an environment, run commands inside it, read logs, set env vars and query the database.

## Not available on Rainbow today

- **Fork pull requests**: Rainbow does not create an environment for them. Check for the `rainbow-machine/preview` status on the head commit.
- **Slack**: no Slack host is in the egress allow list and no Slack secret is set. Use a local instance ([slack-local-development.md](slack-local-development.md)).
- **Headless browser**: there is no headless browser service.
- **NATS**: there is no NATS service.
- **SSH tunnel**: there is no SSH server to test warehouse SSH tunnels against.
- **Prometheus**: there is no Prometheus service.

For the headless browser, NATS, the SSH tunnel and Prometheus, use a local instance with the [supporting services in containers](../.github/CONTRIBUTING.md#supporting-services-in-containers).
- **Backend debugger**: attach to a local instance instead ([CONTRIBUTING.md](../.github/CONTRIBUTING.md#backend-debugger)).
