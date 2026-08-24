# Contributing to Lightdash

Lightdash is open source and everyone is welcome to report problems, suggest improvements and participate in the community.

To keep the project sustainable for its maintainers, _we review pull requests only from maintainers and trusted contributors who have agreed on the work with us in advance_. We do not accept unsolicited code contributions.

## Why we work this way

The dynamics of writing software have changed. Producing code is now faster and easier than ever, but reviewing and maintaining it still requires significant time and care, as every change needs to be understood, tested and maintained over time. In practice, reviewing an unsolicited pull request can take us longer than implementing the same change ourselves.

Lightdash is used around the world and we are responsible for keeping it reliable, secure and sustainable.

This is not a judgment on the effort or ability of people who want to contribute. It is a practical response to how software is built today and what it takes to maintain Lightdash sustainably.

## How can you contribute

You don't need to be a trusted contributor to participate in the Lightdash community. We welcome everyone to:

- [Report bugs](https://github.com/lightdash/lightdash/issues/new?template=bug_report.yml) through GitHub Issues.
- [Suggest features and product improvements](https://github.com/lightdash/lightdash/issues/new?template=feature-request.yml).
- Upvote, add context, reproduction steps or examples to [existing issues](https://github.com/lightdash/lightdash/issues).
- Share feedback about how you use Lightdash or help other users in the [Slack Community](http://go.lightdash.com/community).

_Clear bug reports, thoughtful feature requests and real-world context are some of the most valuable contributions you can make_ (often more valuable to us than the implementation itself).

For security vulnerabilities, please use GitHub’s private vulnerability-reporting functionality or email security@lightdash.com.

## Becoming a trusted contributor

Trusted contributors are users who have built an ongoing relationship with Lightdash and our community. Trust develops through useful participation, demonstrated understanding of the product and consistent collaboration with the maintainers.

There is no application form. If you are already an active member of the community and would like to contribute, talk to us through the channels you normally use before starting work.

> [!IMPORTANT]
> Already a trusted contributor? Please still talk to a Lightdash maintainer and agree the scope before starting work. Otherwise, we may close the pull request without review.

## Contributing code

If a Lightdash maintainer has invited you to contribute or approved your proposed contribution:

1. Confirm the scope and intended approach with the maintainer before you begin.
2. Make sure the agreement is recorded on the relevant issue or pull request.
3. Read the repository-level guidance and any instruction or context files relevant to the area you are changing, including `AGENTS.md`, `CLAUDE.md` and `CONTEXT-MAP.md`.
4. Keep the pull request focused on the agreed scope.
5. Run the relevant tests and checks before requesting review.

Approval to work on one change does not automatically extend to other changes.

> ### Legal Notice
>
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the
> necessary rights to the content and that the content you contribute may be provided under the project license.

## Code of Conduct

This project and everyone participating in it is governed by the [Lightdash Code of Conduct](https://github.com/lightdash/lightdash/blob/main/.github/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable behavior to <support@lightdash.com>.

## Opening a Pull Request

This section applies only to maintainers and trusted contributors working on an agreed change.

Keep pull requests small where practical. Do not bundle more than one feature or bug fix into a single pull request.

1. Fork the repository.
2. Clone the fork to your local machine and add upstream remote:

```sh
git clone https://github.com/<your username>/lightdash.git
cd lightdash
git remote add upstream https://github.com/lightdash/lightdash.git
```

<!-- #default-branch-switch -->

3. Synchronize your local `main` branch with the upstream one:

```sh
git checkout main
git pull upstream main
```

4. Install the dependencies with pnpm (npm/yarn isn't supported):

```sh
pnpm install
```

5. Create a new topic branch:

```sh
git checkout -b my-topic-branch
```

6. Make changes, commit and push to your fork:

```sh
git push -u origin HEAD
```

7. Go to [the repository](https://github.com/lightdash/lightdash/pulls) and make a Pull Request.

The core team is monitoring for Pull Requests. We will review your Pull Request and either merge it, request changes to
it, or close it with an explanation.

#### Risk Assessment

High-risk changes are changes where a plausible failure could cause unauthorized access, customer data exposure or loss,
a widespread production outage, or weaken security or change-control safeguards. They can also include other material
changes that would be difficult to detect, contain, or reverse. Routine, tested, reversible, or backwards-compatible
changes are normally low risk.

Pull Request authors must identify high-risk changes using the checkbox in the Pull Request template. High-risk changes
must be reviewed and approved by someone other than the author before merging.

#### Commit & Pull Request Naming Conventions

We follow the [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) standard.

```
<type>[optional scope]: <description>
```

E.g:

```
feat: add table calculations
fix: remove infinite loop during login
docs: add page about metrics
style: add more space
```

Note that **feat** and **fix** are typically used for changes that will provide value to the end-user
so they trigger a release (version update). If you are making a change to docs, styles, or some
other part of the system, please use the appropriate tag to avoid the extra overhead.

You can see all the [supported types here](https://github.com/commitizen/conventional-commit-types/blob/v3.0.0/index.json).

This format is enforced in two places:

- Locally, the `commit-msg` hook (`.husky/commit-msg`) rejects non-conventional commit messages at commit time.
- On GitHub, the `Validate PR Title` check validates the PR title (and, for single-commit PRs, the commit message) as soon as the PR is opened or the title is edited. The PR title matters because we squash & merge: it becomes the commit on `main` that semantic-release reads.

#### Merge Strategy

We use `squash & merge` to keep the main branch history clean.

#### Styleguides

Our styleguides should be enforced via a pre-commit hook that runs oxfmt & eslint.
The reviewers can still request adhoc changes for situations that haven't been experienced before.

## Setup Development Environment

Packages overview:

- [`frontend` - React frontend](../packages/frontend/README.md)
- [`backend` - Node.js backend](../packages/backend/README.md)
- `common` - Shared code between all the other packages
- `cli` - Command line interface
- `e2e` - End-to-end and integration tests
- `warehouses` - Classes for connecting to different databases

#### using Docker compose

You can create a developer environment using docker compose:

```shell
# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash
```

Copy `.env.development` into a new file called `.env.development.local` and run the following `docker compose up`
command:

```shell
# Create docker containers
# Note: before the next step make sure your docker has 4GB of memory ( Docker -> settings -> resources ) you should be able to manipulate the values here.

docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
```

When ready, access the development container and run these commands:

```shell
# Connect to container
docker exec -it lightdash-app-lightdash-dev-1 bash

# Skip playwright download
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true

# Install dependencies & build common package
./scripts/build.sh

# Setup dbt
./scripts/seed-jaffle.sh

# Setup the database
./scripts/migrate.sh
./scripts/seed-lightdash.sh

# Run Lightdash frontend and backend in dev mode
pnpm dev # http://localhost:3000

# Log in dev mode
# When navigating to http://localhost:3000 you will be prompted to the login page, you can use our demo login details:

# Email-Address: demo@lightdash.com
# Password: demo_password!

# Or run in production mode
# pnpm build
# pnpm start # http://localhost:8080
```

Notes:

- If you change files inside `/packages/common` you should run `pnpm common-build` before `pnpm dev`
- If you change files inside `/packages/warehouses` you should run `pnpm warehouses-build` before `pnpm dev`
- If you rename files the container might not recognise the changes. To fix this, stop the containers and start again.
- If you need to change any of the environment variables, you can do so by editing `.env.development.local` and re-run the `docker compose up` command mentioned above
- On MacOS, you may need to add an entry to your `/etc/hosts` file, mapping `minio` to `127.0.0.1` to be able to access the container via its name.

When you want to stop:

```shell
docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local stop
```

When you want to start:

```shell
docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local start
```

#### Testing an SSH Tunnel Locally

To test an SSH tunnel with Lightdash in your local development environment:

1. **Go to Project Connection Advanced Settings**
    - In the Lightdash UI, navigate to your project connection settings.
    - Expand the advanced settings and set `Use SSH tunnel` to **true**.

2. **Add the SSH Tunnel config**
    - SSH Remote host: `ssh-server`
    - SSH Remote port: `2222`
    - SSH Username: `sshuser`

3. **Generate a Key Pair**
    - Use the UI to generate a new SSH key pair for the tunnel.

4. **Copy the Public Key**
    - Copy the generated public key from the UI.
    - Open your `.env.development.local` file and set:
        ```
        DEV_SSH_PUBLIC_KEY="<paste your public key here>"
        ```

5. **Restart Docker Compose**
    - Re-run the following command to apply the new SSH key:
        ```sh
        docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
        ```

This will update the SSH server container with your new public key, allowing you to test SSH tunnel connections from your local Lightdash instance.

#### Testing Prometheus Metrics Locally

The development environment includes Prometheus for monitoring Lightdash metrics. To use it:

1. **Start the development environment** with Prometheus enabled:

    ```shell
    docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
    ```

2. **Verify Prometheus is running**:
    - Prometheus UI: http://localhost:9091
    - Lightdash metrics endpoint: http://localhost:9090/metrics

3. **Configure Prometheus settings** (optional):
    - Edit `.env.development.local` to customize:
        ```
        LIGHTDASH_PROMETHEUS_ENABLED=true
        LIGHTDASH_PROMETHEUS_PORT=9090
        LIGHTDASH_PROMETHEUS_PATH=/metrics
        ```

4. **View metrics in Prometheus**:
    - Navigate to http://localhost:9091
    - Use the expression browser to query Lightdash metrics
    - Example queries: `queue_size`, `nodejs_eventloop_utilization`

The Prometheus configuration automatically scrapes Lightdash metrics every 5 seconds from the backend service.

#### Testing Email Locally with Mailpit

The development environment includes Mailpit for testing email functionality locally without sending real emails. To use it:

1. **Start the development environment** (Mailpit is included by default):

    ```shell
    docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
    ```

2. **Access the Mailpit Web UI**:
    - Navigate to http://localhost:8025
    - All emails sent from Lightdash will appear here
    - You can view full email content, headers, and HTML rendering

3. **Email Configuration** (pre-configured in `.env.development`):
    - SMTP Host: `mailpit` (Docker hostname)
    - SMTP Port: `1025`
    - No authentication required for local development

4. **Test email features**:
    - Scheduled email deliveries
    - User invitation emails
    - Sharing alerts via email
    - Password reset emails

#### Testing Email Locally with Mailpit (without Docker)

If you're running Lightdash without Docker, you can install and run Mailpit directly:

1. **Install Mailpit**:

    **macOS (using Homebrew):**

    ```shell
    brew install mailpit
    ```

    **Linux/macOS (using install script):**

    ```shell
    sudo bash < <(curl -sL https://raw.githubusercontent.com/axllent/mailpit/develop/install.sh)
    ```

    **Other options:** See the [Mailpit installation guide](https://github.com/axllent/mailpit#installation) for more methods including Arch Linux (AUR), FreeBSD, or downloading static binaries.

2. **Run Mailpit**:

    ```shell
    mailpit
    ```

    Or run as a background service on macOS:

    ```shell
    brew services start mailpit
    ```

3. **Configure Lightdash** in your `.env.development.local`:

    ```shell
    SMTP_HOST=localhost
    SMTP_PORT=1025
    SMTP_SECURE=false
    SMTP_ALLOW_INVALID_CERT=false
    SMTP_SENDER_EMAIL=lightdash@localhost.com
    SMTP_SENDER_NAME=Lightdash
    ```

4. **Access the Mailpit Web UI**:
    - Navigate to http://localhost:8025
    - All emails sent from Lightdash will appear here

#### Downloading files stored in local docker container MinIO

When developing using the docker compose setup there's a MinIO container already setup to serve as the S3 compatible
storage to save any files that are exported from the app - these can be images, results csv, etc.

Because the MinIO internal docker endpoint is not accessible to the host machine - `localhost` - it needs to be added to
the `/etc/hosts` configuration in your computer otherwise it will fail with a `DNS_PROBE_FINISHED_NXDOMAIN` error.

1. Edit the hosts file using a text editor (e.g. vim, nano, etc.) with administrator privileges:
   `sudo nano /etc/hosts`
2. Add the following line at the end of the file:
   `127.0.0.1    minio`
3. Save the file

#### Setup Development Environment without Docker

To setup Development Environment without Docker you need following pre-requisites before running Lightdash:

- node >= v24 (see `.nvmrc` for the exact version)
- python >= 3.8
- pnpm
- postgres >= 12
- dbt 1.7.x aliased to `dbt1.7`

eg. on MacOS you can follow this instructions:

```shell
# 1 Install Homebrew (https://brew.sh)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2 Install nvm (https://github.com/nvm-sh/nvm#troubleshooting-on-macos) and other required dependencies
brew update
brew install nvm

# 3 Install specified node version using NVM (https://github.com/nvm-sh/nvm)

nvm install v24.18.0
nvm alias default v24.18.0

# 4 Install postgres (https://wiki.postgresql.org/wiki/Homebrew) and pgvector
brew install postgresql@14
brew services start postgresql@14

# pgvector is an extension for postgres we use in Lightdash, it needs to be installed separately
# More info about this extension and a detailed installation guide available here: https://github.com/pgvector/pgvector
# on Linux, you can install `postgresql-14-pgvector`, available on apt
# You might need to point pgvector to a correct postgres instance if you have multiple versions installed
# export PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git && cd pgvector && make && sudo make install && cd ..

# 5 Install dbt using pip
# Detailed installation guide available here: https://docs.getdbt.com/docs/core/pip-install
# Create python virtual env
python3 -m venv env-lightdash # or your preferred env name
# Activate the env
# You can deactivate python virtual env by running `deactivate` later
source env-lightdash/bin/activate

python -m pip install 'dbt-core==1.7.*' 'dbt-postgres==1.7.*'

# ALias the dbt command to `dbt1.7` so it doesn't conflict with other dbt versions
ln -s $(which dbt) $(pwd)/env-lightdash/bin/dbt1.7

# 6 Clone the repo and open it in your IDE
git clone https://github.com/lightdash/lightdash.git
cd lightdash

# 7 Copy `.env.development` to `.env.development.local`
cp .env.development .env.development.local

# 8 Edit some environment variables to match your setup
open .env.development.local -t

# 8.1 You may need to edit the following variables:
PGHOST=localhost
PGPORT=5432
PGUSER=pg_user *OR* machine username if no prior postgres set up
PGPASSWORD=pg_password *OR* blank if no prior postgres set up
PGDATABASE=postgres
DBT_DEMO_DIR=$PWD/examples/full-jaffle-shop-demo

# 9 Install packages
pnpm install

# 10 Build / migrate / seed
pnpm load:env ./scripts/build.sh
pnpm load:env ./scripts/seed-jaffle.sh
pnpm load:env ./scripts/migrate.sh
pnpm load:env ./scripts/seed-lightdash.sh

# Run
pnpm load:env pnpm dev

# Log in dev mode
When navigating to http://localhost:3000 you will be prompted to the login page, you can use our demo login details:

Email-Address: demo@lightdash.com
Password: demo_password!
```

> ⚠️ you can add env variables to your system and ignore running `pnpm load:env` before each command

#### How to run unit tests

```shell
# Prepare dependencies
pnpm install
pnpm common-build
pnpm warehouses-build

# Run unit tests
pnpm test
```

The backend has several test commands for different scenarios:

```bash
# Run all tests with type checking (for CI/production)
pnpm -F backend test

# Run tests in development mode with performance optimizations
pnpm -F backend test:dev

# Run tests sequentially with type checking (for debugging)
pnpm -F backend test-sequential
```

#### How to run e2e tests

Before running e2e tests make sure you're running the app locally.

```shell
# Prepare dependencies
pnpm install
pnpm common-build
pnpm warehouses-build

# Run cypress in interactive mode
pnpm e2e-open

# Or run cypress in cli mode
pnpm e2e-run
```

Note:

- Edit `packages/e2e/cypress.json` if you're running Lightdash on a different domain/port than `http://localhost:8080`

#### How to check code quality

```shell
pnpm lint
pnpm format
```

#### Developing API endpoints

API endpoints are written in controllers, which are located in `packages/backend/src/controllers`. Controllers are
then registered in `packages/backend/src/index.ts` but in order to be made available you'll need to regenerate the
`routes.ts` file by executing:

```shell
pnpm generate-api
```

### Running headless browser locally

Headless browser is used to generate images we use for Slack unfurls or on scheduled deliveries,
you can find more about headless browser
on [our docs](https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash).

If you want to debug some of these features, you should run headless browser locally on docker.

#### Running Lightdash on docker and headless browser

If you are running both Lightdash and Headless browser using our docker-compose yml set-up you should be ok, and
everything should work as expected.

#### Running Lightdash without docker and headless browser on Linux

If you are running lightdash without docker, you will have to run headless browser in a way that it is able to connect
to your lightdash endpoint in localhost. You can achieve this on Linux by doing:

```shell
docker run -e PORT=3001 --name=lightdash-headless --network 'host' -it --rm ghcr.io/browserless/chromium:v2.24.3
```

Then make sure to configure the following ENV variables:

```shell
export HEADLESS_BROWSER_HOST='localhost'
export HEADLESS_BROWSER_PORT=3001
export SITE_URL=http://localhost:3000
```

#### Running Lightdash without docker and headless browser on Mac

If you are running Lightdash without docker on Mac, you will have to run docker and create an special host to reach
lightdash because it can't use localhost.

```shell
docker run -e PORT=3001 -p 3001:3001 --name=lightdash-headless --add-host=lightdash-dev:host-gateway -it --rm ghcr.io/browserless/chromium:v2.24.3
```

Make sure to add the following line to your `/etc/hosts` file:

```
127.0.0.1 lightdash-dev
```

Then headless browser should be able to reach lightdash on `http://lightdash-dev:3000`

So make sure to configure the following ENV variables:

```shell
export HEADLESS_BROWSER_HOST='localhost'
export HEADLESS_BROWSER_PORT=3001
export SITE_URL=http://lightdash-dev:3000
```

## Join The Lightdash Team

If you are interested in joining our team, check our [job board](https://www.notion.so/gethubble/Job-Board-a2c7d872794b45deb7b76ad68701d750)!
