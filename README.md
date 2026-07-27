<p align="center">
  <a href="https://www.lightdash.com">
    <img src="./packages/frontend/src/svgs/logo.svg" width="180" alt="Lightdash logo" />
  </a>
</p>

<h2 align="center">Open-source Agentic BI for modern data teams</h2>

<p align="center">
  Build governed metrics, dashboards, AI agents, and data apps from your context layer.
  Ship analytics through Git, CI, MCP, and the Lightdash CLI.
</p>

> [!NOTE]
> Hero placeholder: add a new product-led image here before merge. It should show Lightdash Cloud, AI agents, BI as code, Data Apps, and the context layer without falling back to a generic chart screenshot.

## Why Lightdash

Lightdash is the Agentic BI platform for teams that want analytics to move like software. Your context layer defines trusted metrics, joins, permissions, business logic, and caching once, then powers every way people consume data: dashboards, AI agents, data apps, embedded analytics, SDKs, and MCP.

Data teams can build and maintain analytics with any AI agent, then use the terminal, pull requests, and CI to preview, validate, and ship changes. Business users can ask questions in plain English, explore dashboards, or create custom data apps without bypassing governance.

## Start with Cloud

The fastest way to use Lightdash is [Lightdash Cloud](https://www.lightdash.com/start): no infrastructure to run, always up to date, and ready for AI agents, Data Apps, scheduled deliveries, embedding, and enterprise controls.

Want to explore first? Try the [live demo](https://demo.lightdash.com/login), read the [docs](https://docs.lightdash.com), or [book a sales call](https://lightdash.cal.com/ian/30).

## What you can build

### BI as code

Your metrics, charts, and dashboards live as files. Build them with coding agents, preview changes from the CLI, validate in CI, and review analytics in pull requests.

[Learn about BI as code](https://www.lightdash.com/bi-as-code)

### AI agents

Lightdash agents answer from your context layer, not raw table guesses. They respect permissions, return inspectable queries, reuse verified answers, and improve through reviews and evaluations.

[Explore Conversational Analytics](https://www.lightdash.com/conversational-analytics)

### Data Apps

Build custom reports, workbooks, slide decks, forecasting tools, and customer-facing data products from a prompt, with your context layer, permissions, and auth already built in.

[See Data Apps](https://www.lightdash.com/data-apps)

### Context layer

Define metrics, dimensions, joins, descriptions, caching, and access rules in one governed layer. Use dbt projects or standalone Lightdash YAML pointed at your warehouse.

### Embedded analytics

Embed dashboards, AI agents, and Data Apps in your product with the Lightdash SDK, row-level security, user attributes, and customer-facing permissions.

[Read embedding docs](https://docs.lightdash.com/references/embedding)

### Open-source core

Self-host the core BI platform, contribute improvements, and run Lightdash in your own infrastructure. Enterprise deployments can add commercial features and support.

[Self-host Lightdash](https://docs.lightdash.com/self-host/self-host-lightdash)

## Build with agents

Lightdash gives coding agents the context they need to make safe analytics changes: install the Lightdash skills, preview what changed, then validate the project before anything lands.

```bash
lightdash install-skills
lightdash preview
lightdash validate
```

Use agent skills and the Lightdash MCP server to build charts, dashboards, metrics, and Data Apps from your editor or terminal. Every change can still go through the workflow your team trusts: preview the branch, validate the project, review the pull request, merge.

## Installation

### Cloud

Sign up for [Lightdash Cloud](https://www.lightdash.com/start) to get a hosted workspace in minutes. This is the recommended path for teams that want AI agents, Data Apps, managed upgrades, and production-ready infrastructure without operating Lightdash themselves.

### Self-host

Run Lightdash on your own infrastructure with Docker or Kubernetes.
If you're deploying to production, start with the [production deployment checklist](https://docs.lightdash.com/self-host/production-deployment-checklist).

- [Self-hosting guide](https://docs.lightdash.com/self-host/self-host-lightdash)
- [Helm charts](https://github.com/lightdash/helm-charts)

### Local development

```bash
git clone https://github.com/lightdash/lightdash.git
cd lightdash
./scripts/install.sh
```

See the [contributing guide](https://github.com/lightdash/lightdash/blob/main/.github/CONTRIBUTING.md) for the full local setup, package scripts, and development workflow.

## Stack

Lightdash is a TypeScript monorepo built with:

- React, Mantine, Vite, and TanStack Query on the frontend
- Node.js, Express, TSOA, Knex, and PostgreSQL on the backend
- Warehouse adapters for BigQuery, Snowflake, Redshift, Databricks, Postgres, Trino, ClickHouse, and more
- A CLI, MCP server, SDKs, Git integrations, and content-as-code workflows for developer-native analytics

## Community

Lightdash is open source and built with the community.

- Join the [Lightdash Slack community](https://go.lightdash.com/community)
- Open a [bug report or feature request](https://github.com/lightdash/lightdash/issues/new/choose)
- Read the [contributing guide](https://github.com/lightdash/lightdash/blob/main/.github/CONTRIBUTING.md)
- Follow Lightdash on [LinkedIn](https://www.linkedin.com/company/lightdash) and [X](https://twitter.com/lightdash_devs)

Thanks to everyone who has contributed code, docs, issues, ideas, and feedback. See the [contributors graph](https://github.com/lightdash/lightdash/graphs/contributors) for the full community.
