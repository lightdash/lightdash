<h1 align="center">
        <a href="https://www.lightdash.com">⚡️ Lightdash </a>
</h1>

<p align="center">The open source Looker alternative</p>

<div align="center">
        <img align="center" style="max-width:300px;" src="/static/screenshots/lightdashpreview.gif">
</div>
<br>
<p align="center">
    <a href="http://www.lightdash.com"><b>Website</b></a> •
    <a href="https://www.loom.com/share/f3725e98ce4840bda3f719da647f58b0"><b>Demo</b></a> • 
    <a href="http://docs.lightdash.com/"><b>Docs</b></a>
</p>

## Features
- [x] Data visualisations
- [x] Shareable URLs
- [x] Export data to CSV
- [x] dbt metadata available in UI

## About Lightdash

Lightdash removes the gap between your data transformation layer and your data visualization layer. It enables data analysts and engineers to control all of their business intelligence (data transformations/business logic as well as data visualization) in a single place.

Lightdash integrates with your dbt project and gives a framework for defining metrics and specifying joins between models all within your existing dbt YAML files. The data output from your dbt project is then available for exploring and sharing in Lightdash.

- No more scattered, duplicated metrics across multiple tools.
- No more time spent trying to maintain data changes in both dbt and and your data viz tools.  
- No more context lost between your data transformation and your data visualization layer.

## Getting Started

### Quickstart with docker

The fastest way to get started is to use [docker](https://docs.docker.com/get-docker/)

```shell
# Clone the lightdash repo
git clone https://github.com/lightdash/lightdash

# Enter the repo directory
cd lightdash

# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_DIR=/Users/myuser/dbtrepo
```

### Launching Lightdash:
#### If you're NOT using BigQuery:
```
# Build and launch Lightdash
docker-compose -f docker-compose.yml up

# Ready on http://localhost:8080 !
```

#### If you're using BigQuery:
```
# Build and launch Lightdash
docker-compose -f docker-compose.yml -f docker-compose.gcloud.yml up

# Ready on http://localhost:8080 !
```
---
### Installation from source

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
