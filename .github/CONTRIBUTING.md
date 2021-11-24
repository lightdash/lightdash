
# Contributing to Lightdash

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
> - Join [the community](https://community.lightdash.com)
> - Star the project
> - Tweet about it
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues


## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [I Have a Question](#i-have-a-question)
- [I Want To Contribute](#i-want-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
- [Join The Project Team](#join-the-project-team)

## Code of Conduct

This project and everyone participating in it is governed by the
[Lightdash Code of Conduct](https://github.com/lightdash/lightdash/blob/main/.github/CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable behavior
to <support@lightdash.com>.


## I Have a Question

> If you want to ask a question, we assume that you have read the available [Documentation](https://docs.lightdash.com).

Before you ask a question, it is best to search for existing [Issues](https://github.com/lightdash/lightdash/issues) that might help you. In case you have found a suitable issue and still need clarification, you can write your question in this issue. It is also advisable to search the internet for answers first.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](https://github.com/lightdash/lightdash/issues/new).
- Provide as much context as you can about what you're running into.
- Provide project and platform versions (nodejs, npm, etc), depending on what seems relevant.

We will then take care of the issue as soon as possible.

## I Want To Contribute

> ### Legal Notice 
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

### Reporting Bugs


#### Before Submitting a Bug Report

A good bug report shouldn't leave others needing to chase you up for more information. Therefore, we ask you to investigate carefully, collect information and describe the issue in detail in your report. Please complete the following steps in advance to help us fix any potential bug as fast as possible.

- Make sure that you are using the latest version.
- Determine if your bug is really a bug and not an error on your side e.g. using incompatible environment components/versions (Make sure that you have read the [documentation](https://docs.lightdash.com). If you are looking for support, you might want to check [this section](#i-have-a-question)).
- To see if other users have experienced (and potentially already solved) the same issue you are having, check if there is not already a bug report existing for your bug or error in the [bug tracker](https://github.com/lightdash/lightdash/issues?q=label%3Abug).
- Also make sure to search the internet (including Stack Overflow) to see if users outside of the GitHub community have discussed the issue.
- Collect information about the bug:
  - Stack trace (Traceback)
  - OS, Platform and Version (Windows, Linux, macOS, x86, ARM)
  - Version of the interpreter, compiler, SDK, runtime environment, package manager, depending on what seems relevant.
  - Possibly your input and the output
  - Can you reliably reproduce the issue? And can you also reproduce it with older versions?


#### How Do I Submit a Good Bug Report?

> You must never report security related issues, vulnerabilities or bugs to the issue tracker, or elsewhere in public. Instead sensitive bugs must be sent by email to <security@lightdash.com>.
<!-- We may add a PGP key to allow the messages to be sent encrypted as well. -->

We use GitHub issues to track bugs and errors. If you run into an issue with the project:

- Open an [Issue](https://github.com/lightdash/lightdash/issues/new). (Since we can't be sure at this point whether it is a bug or not, we ask you not to talk about a bug yet and not to label the issue.)
- Explain the behavior you would expect and the actual behavior.
- Please provide as much context as possible and describe the *reproduction steps* that someone else can follow to recreate the issue on their own. This usually includes your code. For good bug reports you should isolate the problem and create a reduced test case.
- Provide the information you collected in the previous section.

Once it's filed:

- The project team will label the issue accordingly.
- A team member will try to reproduce the issue with your provided steps. If there are no reproduction steps or no obvious way to reproduce the issue, the team will ask you for those steps and mark the issue as `needs-repro`. Bugs with the `needs-repro` tag will not be addressed until they are reproduced.
- If the team is able to reproduce the issue, it will be marked `needs-fix`, as well as possibly other tags (such as `critical`), and the issue will be left to be [implemented by someone](#your-first-code-contribution).

### Suggesting Enhancements

This section guides you through submitting an enhancement suggestion for Lightdash, **including completely new features and minor improvements to existing functionality**. Following these guidelines will help maintainers and the community to understand your suggestion and find related suggestions.


#### Before Submitting an Enhancement

- Make sure that you are using the latest version.
- Read the [documentation](https://docs.lightdash.com) carefully and find out if the functionality is already covered, maybe by an individual configuration.
- Perform a [search](https://github.com/lightdash/lightdash/issues) to see if the enhancement has already been suggested. If it has, add a comment to the existing issue instead of opening a new one.
- Find out whether your idea fits with the scope and aims of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Keep in mind that we want features that will be useful to the majority of our users and not just a small subset.


#### How Do I Submit a Good Enhancement Suggestion?

Enhancement suggestions are tracked as [GitHub issues](https://github.com/lightdash/lightdash/issues).

- Use a **clear and descriptive title** for the issue to identify the suggestion.
- Provide a **step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior** and **explain which behavior you expected to see instead** and why. At this point you can also tell which alternatives do not work for you.
- You may want to **include screenshots and animated GIFs** which help you demonstrate the steps or point out the part which the suggestion is related to.
- **Explain why this enhancement would be useful** to most Lightdash users. You may also want to point out the other projects that solved it better and which could serve as inspiration.

### Your First Code Contribution

First you must setup your development environment.

#### Github Codespaces / VS Code Remote Containers

The fastest way to setup a development environment is to use Github Codespaces or VS Code Remote Containers.
This provides:

* All dependencies
* A postgres database for development
* A sample dbt project
* A pre-configured code editor

To get started:
* in Github [create a codespace](https://docs.github.com/en/codespaces/developing-in-codespaces/creating-a-codespace)
* in VS Code [install the remote containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

Once connected run the following commands in the VS Code terminal:
```shell
# Setup the database
yarn workspace backend migrate
yarn workspace backend seed

# Run Lightdash frontend and backend in dev mode
yarn dev
```

#### Docker compose

Alternatively you can create a developer environment using docker compose:

```shell
docker compose -f ./docker/docker-compose.dev.yml --env-file ./docker/.env up
```

When ready, access the development container and run these commands:

```shell
# Connect to container
docker compose exec lightdash-dev /bin/bash

# Setup the database
yarn workspace backend migrate
yarn workspace backend seed

# Run Lightdash frontend and backend in dev mode
yarn dev
```

#### Setup development environment locally

Finally you can build a development environment from scratch.

Lightdash requires node.js, yarn and dbt. 

```shell
# Install node with homebrew
brew install node

# Install yarn with node package manager
npm install -g yarn

# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash

# Enter the repo directory
cd lightdash

# Install Lightdash dependencies
yarn install

# Start DB
docker run --name lightdash-db -p "5432:5432" -e POSTGRES_PASSWORD=mysecretpassword -d postgres
yarn workspace backend migrate
yarn workspace backend seed

# Expose Lightdash configuration 
# Note: Edit lightdash.yml to point to your dbt project and profile
export LIGHTDASH_CONFIG_FILE=${PWD}/lightdash.yml
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=postgres
export PGUSER=postgres
export PGPASSWORD=mysecretpassword

# Run app in development mode in http://localhost:3000
yarn common-build
yarn dev

# Or run in production mode in http://localhost:8080 with the commands bellow
# yarn build
# yarn start
```

> If you change files inside `/packages/common` you should run `yarn common-build` before `yarn dev`.

#### How to debug Postgres DB

In codespaces / VS Code - use the SQLTools extension provided.

For manual development environments:

```shell
docker run --name db-admin-panel --link lightdash-db:db -p 8181:8080 adminer
# Open browser tab: http://localhost:8181
```

#### How to run unit tests

```shell
yarn test
```

#### How to run e2e tests
Before running e2e tests make sure you'r running the app locally.

> Edit `packages/e2e/cypress.json` if you'r running Lightdash on a different domain/port than `http://localhost:8080`

```shell
# run cypress in interactive mode
yarn e2e-open

# or run cypress in cli mode
yarn e2e-run
```

#### How to check code quality

```shell
yarn lint
yarn format
```

#### Merge strategy
We only use `rebase & merge` so in case of conflicts you should rebase your branch. You can check these ['how to rebase'](https://www.w3docs.com/snippets/git/how-to-rebase-git-branch.html) instructions if you are unfamiliar with it.

#### Styleguides
Our styleguides should be enforced via a pre-commit hook that runs prettier & eslint.
The reviewers can still request adhoc changes for situations that haven't been experienced before.

## Join The Project Team
If you are interested in joining our team, check our [job board](https://www.notion.so/gethubble/Job-Board-a2c7d872794b45deb7b76ad68701d750)!

## Attribution
This guide is based on the **contributing-gen**. [Make your own](https://github.com/bttger/contributing-gen)!
