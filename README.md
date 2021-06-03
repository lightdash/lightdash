<h1 align="center">
        <a href="https://www.lightdash.com">⚡️ Lightdash </a>
</h1>

<p align="center">The open source Looker alternative</p>

<div align="center">
        <a target="_blank" href="https://www.loom.com/share/f3725e98ce4840bda3f719da647f58b0"><img align="center" style="max-width:300px;" src="/static/screenshots/lightdashpreview.gif"> </a>
</div>
<br>
<p align="center">
    <a href="http://www.lightdash.com"><b>Website</b></a> •
    <a href="https://www.loom.com/share/f3725e98ce4840bda3f719da647f58b0"><b>Watch demo</b></a> • 
    <a href="http://docs.lightdash.com/"><b>Docs</b></a>
</p>
<div align="center">
<img src="https://img.shields.io/github/license/lightdash/lightdash" />
</div>
<div align="center">
<img src="https://img.shields.io/docker/cloud/build/lightdash/lightdash" />
<img src="https://img.shields.io/snyk/vulnerabilities/github/lightdash/lightdash?label=snyk%20vulnerabilities" />
</div>
<div align="center">
<img src="https://img.shields.io/github/languages/top/lightdash/lightdash" />
<img src="https://img.shields.io/docker/v/lightdash/lightdash?label=latest%20image" />
<img src="https://img.shields.io/github/package-json/dependency-version/lightdash/lightdash/react?filename=packages%2Ffrontend%2Fpackage.json" />
<img src="https://img.shields.io/github/package-json/dependency-version/lightdash/lightdash/express?filename=packages%2Fbackend%2Fpackage.json" />
</div>

Lightdash is a BI tool that is fully integrated with your dbt project, allowing you to define metrics alongside your data models.

## Features

* [x] 🙏 Familiar interface for your users to self-serve using pre-defined metrics
* [x] 👩‍💻 Declare dimensions and metrics in yaml alongside your dbt project
* [x] 🤖 Automatically creates dimensions from your dbt models
* [x] 📖 All dbt descriptions synced for your users
* [x] 📊 Simple data visualisations for your metrics
* [x] 🚀 Share your work as a URL or export results to use in any other tool

## Get started

Start learning Lightdash:

* [Play with a UI demo](https://demo.lightdash.com) (*no setup*)
* [Setup your own lightdash with demo data](https://docs.lightdash.com/get-started/setup-the-demo-project) (*run locally with docker*)
* [Setup Lightdash with your existing dbt project](https://docs.lightdash.com/get-started/setup-an-existing-dbt-project) (*requires your own dbt project*)

## About Lightdash

Lightdash removes the gap between your data transformation layer and your data visualization layer. It enables data analysts and engineers to control all of their business intelligence (data transformations/business logic as well as data visualization) in a single place.

Lightdash integrates with your dbt project and gives a framework for defining metrics and specifying joins between models all within your existing dbt YAML files. The data output from your dbt project is then available for exploring and sharing in Lightdash.

- No more scattered, duplicated metrics across multiple tools.
- No more time spent trying to maintain data changes in both dbt and and your data viz tools.  
- No more context lost between your data transformation and your data visualization layer.

## Run the demo

Get started with a demo dbt project and launch Lightdash on your machine:

```shell
git clone --recurse-submodules https://github.com/lightdash/lightdash
cd lightdash/examples/full-jaffle-shop-demo
docker compose up
```

Open lightdash at `https://localhost:8080`

## Run with your own dbt project

*Bigquery users should read the [additional docs here](https://docs.lightdash.com/get-started/setup-an-existing-dbt-project)*

```shell
cd path/to/your/dbt/project

export DBT_PROJECT_DIR=${PWD}
export DBT_PROFILES_DIR=${HOME}/.dbt
export LIGHTDASH_PORT=8080

docker run -p "${LIGHTDASH_PORT}:8080" -v "${DBT_PROJECT_DIR}:/usr/app/dbt" -v "${DBT_PROFILES_DIR}:/usr/app/profiles" lightdash/lightdash
```

Open lightdash at `https://localhost:8080`

## Installation from source

Lightdash requires node.js and yarn.

**Install dependencies for Mac OS**
```shell
# Install node with homebrew
brew install node

# Install yarn with node package manager
npm install -g yarn

# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash

# Enter the repo directory
cd lightdash

# Install Lightdash dependencies and build
yarn install
yarn build
```

### Launching Lightdash

```shell
# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_DIR=/Users/myuser/dbtrepo

# Build and run Lightdash
yarn start

# Press ALLOW when asked to "accept incoming connections from python"
```

## Docs

---
Have a question about a feature? Or maybe fancy some light reading? Head on over to our [Lightdash documentation](https://docs.lightdash.com/) to check out some tutorials, reference docs, FAQs and more.

## Reporting bugs and feature requests

---
- Want to report a bug or request a feature? Open an [issue](https://github.com/lightdash/lightdash/issues/new/choose).
