# lightdash

lightdash removes the gap between your data transformation layer and your data visualization layer. It enables data analysts and engineers to control all of their business intelligence (data transformations/business logic as well as data visualization) in a single place.

lightdash integrates with your dbt project and gives a framework for defining metrics and specifying joins between models all within your existing dbt YAML files. The data output from your dbt project is then available for exploring and sharing in lightdash.

- No more scattered, duplicated metrics across multiple tools.
- No more time spent trying to maintain data changes in both dbt and and your data viz tools.  
- No more context lost between your data transformation and your data visualization layer.

## Getting Started
---

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

# Build and launch lightdash
docker compose up

# Ready on http://localhost:8080 !
```

### Installation from source

lightdash requires node.js and yarn.

**Install dependencies for Mac OS**
```shell
# Install node with homebrew
brew install node

# Install yarn with node package manager
npm install -g yarn

# Clone the lightdash repo
git clone https://github.com/lightdash/lightdash

# Enter the repo directory
cd lightdash

# Install lightdash dependencies and build
yarn install
yarn build
```

### Adding dimensions, measures, joins, and more to your lightdash project

lightdash's configuration is fully defined in your dbt project. For example, measures and joins sit in your models' .yml files.

Check out our [example_model.yml](https://github.com/lightdash/lightdash/blob/main/examples/example_model.yml) file for more details on how to add these features to your project! 

### Launching lightdash

```shell
# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_PATH=/Users/myuser/dbtrepo

# Build and run lightdash
yarn start

# Press ALLOW when asked to "accept incoming connections from python"
```

## Join the community!
---
- Find us on [Slack](https://join.slack.com/t/seekercommunity/shared_invite/zt-ptiqsd6p-Dbjjn8GXozYkFhARgAs3cw). We'd love to hear what you have to say about lightdash :)
- _coming soon_ Join the discussion in our discourse.

## Reporting bugs and feature requests
---
- Want to report a bug or request a feature? Let us know on [Slack](https://join.slack.com/t/seekercommunity/shared_invite/zt-ptiqsd6p-Dbjjn8GXozYkFhARgAs3cw), or open an [issue](https://github.com/lightdash/lightdash/issues/new/choose).
