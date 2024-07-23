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

If you cannot find an answer to your question then please join our [slack community](https://lightdash-community.slack.com/join/shared_invite/zt-1busg6781-EgwQ6sPLAK3~QU7GA3ttzQ#/shared-invite/email) and head for the `#help` channel.

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

-   Join our [slack community](https://lightdash-community.slack.com/join/shared_invite/zt-1busg6781-EgwQ6sPLAK3~QU7GA3ttzQ) and introduce yourself in the `#community-contributors` channel
-   Choose an existing labelled `open-contribution`
-   Ask a member of the team to assign you to the issue

Pull requests will not be reviewed unless the previous three steps are completed.

---

Working on your first Pull Request? You can learn how from this free video series:

[How to Contribute to an Open Source Project on GitHub](https://egghead.io/courses/how-to-contribute-to-an-open-source-project-on-github)

To help you get your feet wet and get you familiar with our contribution process, we have a list
of [good first issues](https://github.com/lightdash/lightdash/issues?q=is%3Aissue+is%3Aopen+label%3A%22%F0%9F%99%8B+good+first+issue%22)
that contain changes that have a relatively limited scope. This label means that there is already a working solution to
the issue in the discussion section. Therefore, it is a great place to get started.

Pull requests working on other issues or completely new problems may take a bit longer to review when they don't fit
into our current development cycle.

If you decide to fix an issue, please be sure to check the comment thread in case somebody is already working on a fix.
If nobody is working on it at the moment, please leave a comment stating that you have started to work on it so other
people don't accidentally duplicate your effort.

If somebody claims an issue but doesn't follow up for more than a week, it's fine to take it over but you should still
leave a comment.
If there has been no activity on the issue for 7 to 14 days, it is safe to assume that nobody is working on it.

## Opening a Pull Request

Lightdash is a community project, so Pull Requests are always welcome, but, before working on a large change, it is best
to open an issue first to discuss it with the maintainers.

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

4. Install the dependencies with yarn (npm isn't supported):

```sh
yarn install
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
yarn workspace backend migrate
yarn workspace backend seed

# Run Lightdash frontend and backend in dev mode
yarn dev
```

#### using Docker compose

Alternatively you can create a developer environment using docker compose:

```shell
# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash
```

Copy `.env.development` into a new file called `.env.development.local` and run the following `docker compose up` command:

```shell
# Create docker containers
# Note: before the next step make sure your docker has 4GB of memory ( Docker -> settings -> resources ) you should be able to manipulate the values here.

docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
```

When ready, access the development container and run these commands:

```shell
# Connect to container
docker exec -it lightdash-app-lightdash-dev-1 bash

# Skip puppeteer download
export PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies & build common package
./scripts/build.sh

# Setup dbt
./scripts/seed-jaffle.sh

# Setup the database
./scripts/migrate.sh
./scripts/seed-lightdash.sh

# Run Lightdash frontend and backend in dev mode
yarn dev # http://localhost:3000

# Log in dev mode
# When navigating to http://localhost:3000 you will be prompt to the login page, you can use our demo login details:

# Username: demo@lightdash.com
# Password: demo_password!

# Or run in production mode
# yarn build
# yarn start # http://localhost:8080
```

Notes:

-   If you change files inside `/packages/common` you should run `yarn common-build` before `yarn dev`
-   If you change files inside `/packages/warehouses` you should run `yarn warehouses-build` before `yarn dev`
-   If you rename files the container might not recognise the changes. To fix this, stop the containers and start again.
-   If you need to change any of the environment variables, you can do so by editing `.env.development.local` and re-run the `docker compose up` command mentioned above

When you want to stop:

```shell
docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local stop
```

When you want to start:

```shell
docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local start
```

#### Setup Development Environment without Docker

To setup Development Environment without Docker you need following pre-requisites before running Lightdash:

-   node >= v18.x (20 is preferred)
-   yarn
-   postgres >= 12
-   dbt 1.4.x or 1.5.x

eg. on MacOS you can follow this instructions:

```shell
# 1 Install Homebrew (https://brew.sh)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2 Install nvm (https://github.com/nvm-sh/nvm#troubleshooting-on-macos)
brew update
brew install nvm

# 3 Install specified node version using NVM (https://github.com/nvm-sh/nvm)

nvm install v20.8.0
nvm alias default v20.8.0

# 4 Install postgres (https://wiki.postgresql.org/wiki/Homebrew)
brew install postgresql@14
brew services start postgresql@14

# 5 Install dbt (https://docs.getdbt.com/dbt-cli/install/homebrew)
brew tap dbt-labs/dbt
brew install dbt-postgres@1.5.4

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
yarn

# 10 Build / migrate / seed
yarn load:env ./scripts/build.sh
yarn load:env ./scripts/seed-jaffle.sh
yarn load:env ./scripts/migrate.sh
yarn load:env ./scripts/seed-lightdash.sh

# Run
yarn load:env yarn dev

# Log in dev mode
When navigating to http://localhost:3000 you will be prompt to the login page, you can use our demo login details:

Username: demo@lightdash.com
Password: demo_password!
```

> ⚠️ you can add env variables to your system and ignore running `yarn load:env` before each command

#### How to run unit tests

```shell
# Prepare dependencies
yarn install
yarn common-build
yarn warehouses-build

# Run unit tests
yarn test
```

#### How to run e2e tests

Before running e2e tests make sure you're running the app locally.

```shell
# Prepare dependencies
yarn install
yarn common-build
yarn warehouses-build

# Run cypress in interactive mode
yarn e2e-open

# Or run cypress in cli mode
yarn e2e-run
```

Note:

-   Edit `packages/e2e/cypress.json` if you're running Lightdash on a different domain/port than `http://localhost:8080`

#### How to check code quality

```shell
yarn lint
yarn format
```

#### Developing API endpoints

API endpoints are written in controllers, which are located in `packages/backend/src/controllers`. Controllers are
then registered in `packages/backend/src/index.ts` but in order to be made available you'll need to regenerate the
`routes.ts` file by executing:

```shell
yarn workspace backend run tsoa routes
```

### Running headless browser locally

Headless browser is used to generate images we use for Slack unfurls or on scheduled deliveries,
you can find more about headless browser on [our docs](https://docs.lightdash.com/self-host/customize-deployment/enable-headless-browser-for-lightdash).

If you want to debug some of these features, you should run headless browser locally on docker.

#### Running Lightdash on docker and headless browser

If you are running both Lightdash and Headless browser using our docker-compose you should be ok, and everything should work as expected.

#### Running Lightdash without docker and headless browser on Linux

If you are running lightdash without docker, you will have to run headless browser in a way that it is able to connect
to your lightdash endpoint in localhost. You can achive this on Linux by doing:

```shell
docker run -e PORT=3001 --name=lightdash-headless --network 'host' -it --rm browserless/chrome
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
docker run -e PORT=3001 -p 3001:3001 --name=lightdash-headless --add-host=lightdash-dev:host-gateway -it --rm browserless/chrome
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
