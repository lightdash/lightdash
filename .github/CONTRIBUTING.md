# Contributing to Lightdash

Thanks for taking the time to contribute ❤️ all types of contributions are encouraged and valued!

## Table of Contents

-   [Code of Conduct](#code-of-conduct)
-   [How to ask for help](#how-to-ask-for-help)
-   Contributing:
    -   [Report a bug](#how-to-report-a-bug)
    -   [Request a feature](#how-to-request-a-new-feature)
    -   [Contribute code](#how-to-contribute-code-to-lightdash)
-   [Opening a Pull Request](#opening-a-pull-request)
-   [Setup Development Environment](#setup-development-environment)
-   [Join The Lightdash Team](#join-the-lightdash-team)

## Code of Conduct

This project and everyone participating in it is governed by the
[Lightdash Code of Conduct](https://github.com/lightdash/lightdash/blob/main/.github/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable behavior
to <support@lightdash.com>.

## How to ask for help

Useful resources for answering your questions:

-   [Documentation](https://docs.lightdash.com)
-   [Issues](https://github.com/lightdash/lightdash/issues)

If you cannot find an answer to your question then please join
our [slack community](https://join.slack.com/t/lightdash-community/shared_invite/zt-2wgtavou8-VRhwXI%7EQbjCAHQs0WBac3w) and head for the `#help` channel.

## How to report a bug

> Vulnerabilities can be submitted through the GitHub repository security tab or by email at <security@lightdash.com>.

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

-   Open an [Issue](https://github.com/lightdash/lightdash/issues/new). (Since we can't be sure at this point whether it
    is a bug or not, we ask you not to talk about a bug yet and not to label the issue.)
-   Explain the behavior you would expect and the actual behavior.
-   Please provide as much context as possible and describe the _reproduction steps_ that someone else can follow to
    recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem
    and create a reduced test case.

## How to request a new feature

Enhancement suggestions are tracked as [GitHub issues](https://github.com/lightdash/lightdash/issues).

-   Use a **clear and descriptive title** for the issue to identify the suggestion.
-   Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
-   **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point
    you can also tell which alternatives do not work for you.
-   You may want to **include screenshots and animated GIFs** which help you demonstrate the steps or point out the part
    which the suggestion is related to.
-   **Explain why this enhancement would be useful** to most Lightdash users. You may also want to point out the other
    projects that solved it better and which could serve as inspiration.

## How to contribute code to Lightdash

> ### Legal Notice
>
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the
> necessary rights to the content and that the content you contribute may be provided under the project license.

Before contributing to Lightdash you must complete the following steps:

1. **Join our Slack community** Head over to our [Slack Community](https://join.slack.com/t/lightdash-community/shared_invite/zt-2wgtavou8-VRhwXI%7EQbjCAHQs0WBac3w) and introduce yourself in the `#community-contributors` channel.
2. **Pick an issue** Browse through the existing [issues](https://github.com/lightdash/lightdash/issues?q=state%3Aopen%20label%3A%22%F0%9F%91%8B%20open-contribution%22) and choose one that's labeled `open-contribution`.
3. **Claim your issue** Post in the `#community-contributors` Slack channel using this template:

    ` Hi Lightdash team, I'd like to work on this open-contribution issue: [paste your issue link here]`

4. **Get started** Once you're assigned to the issue, you can get started on your contribution. Make sure you go through our CLAUDE.md files to get a sense of our ways of coding while working on your changes.
5. **Submit a PR** When ready, create a pull request with your changes. This will trigger GitHub Actions to validate the changes you made. Please wait for this to complete in full and ensure that you fix any issues highlighted by GitHub Actions.

> Important Note: Pull requests will not be reviewed unless these steps are followed.

> Please bear with us: We're a small team doing our best to review contributions quickly, but it might take us a while to get to your PR - especially if the changes are large or if they don't align with our current development cycle. We appreciate your patience!

New to open source? Check out this free series: [How to Contribute to an Open Source Project on GitHub](https://egghead.io/courses/how-to-contribute-to-an-open-source-project-on-github)

## Opening a Pull Request

Lightdash is a community project, so Pull Requests are always welcome, but, before working on a large change, it is best
to open an issue first to discuss it and get the go-ahead from the maintainers (see required contribution steps [here](#how-to-contribute-code-to-lightdash)).

When in doubt, keep your Pull Requests small. To give a Pull Request the best chance of getting accepted, don't bundle
more than one feature or bug fix per Pull Request. It's often best to create two smaller Pull Requests than one big one.

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

You can see all
the [supported types here](https://github.com/commitizen/conventional-commit-types/blob/v3.0.0/index.json).

#### Merge Strategy

We use `squash & merge` to keep the main branch history clean.

#### Styleguides

Our styleguides should be enforced via a pre-commit hook that runs prettier & eslint.
The reviewers can still request adhoc changes for situations that haven't been experienced before.

## Setup Development Environment

Packages overview:

-   [`frontend` - React frontend](../packages/frontend/README.md)
-   [`backend` - Node.js backend](../packages/backend/README.md)
-   `common` - Shared code between all the other packages
-   `cli` - Command line interface
-   `e2e` - End-to-end and integration tests
-   `warehouses` - Classes for connecting to different databases

#### using Github Codespaces / VS Code Remote Containers

The fastest way to setup a development environment is to use Github Codespaces or VS Code Remote Containers.
This provides:

-   All dependencies
-   A postgres database for development
-   A sample dbt project
-   A pre-configured code editor

To get started:

-   in Github [create a codespace](https://docs.github.com/en/codespaces/developing-in-codespaces/creating-a-codespace)
-   in VS
    Code [install the remote containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

Once connected run the following commands in the VS Code terminal:

```shell
# Setup the database
pnpm -F backend migrate
pnpm -F backend seed

# Run Lightdash frontend and backend in dev mode
pnpm dev
```

#### using Docker compose

Alternatively you can create a developer environment using docker compose:

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
# When navigating to http://localhost:3000 you will be prompt to the login page, you can use our demo login details:

# Email-Address: demo@lightdash.com
# Password: demo_password!

# Or run in production mode
# pnpm build
# pnpm start # http://localhost:8080
```

Notes:

-   If you change files inside `/packages/common` you should run `pnpm common-build` before `pnpm dev`
-   If you change files inside `/packages/warehouses` you should run `pnpm warehouses-build` before `pnpm dev`
-   If you rename files the container might not recognise the changes. To fix this, stop the containers and start again.
-   If you need to change any of the environment variables, you can do so by editing `.env.development.local` and re-run
    the `docker compose up` command mentioned above

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

-   node >= v18.x (20 is preferred)
-   python >= 3.3
-   pnpm
-   postgres >= 12
-   dbt 1.7.x aliased to `dbt1.7`

eg. on MacOS you can follow this instructions:

```shell
# 1 Install Homebrew (https://brew.sh)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2 Install nvm (https://github.com/nvm-sh/nvm#troubleshooting-on-macos) and other required dependencies
brew update
brew install nvm

# 3 Install specified node version using NVM (https://github.com/nvm-sh/nvm)

nvm install v20.19.0
nvm alias default v20.19.0

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
When navigating to http://localhost:3000 you will be prompt to the login page, you can use our demo login details:

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

-   Edit `packages/e2e/cypress.json` if you're running Lightdash on a different domain/port than `http://localhost:8080`

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
to your lightdash endpoint in localhost. You can achive this on Linux by doing:

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

If you are interested in joining our team, check
our [job board](https://www.notion.so/gethubble/Job-Board-a2c7d872794b45deb7b76ad68701d750)!
