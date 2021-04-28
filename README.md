# Seeker

Seeker removes the gap between your data transformation layer and your data visualization layer. It enables data analysts and engineers to control all of their business intelligence (data transformations/business logic as well as data visualization) in a single place.

Seeker integrates with your dbt project and gives a framework for defining metrics and specifying joins between models all within your existing dbt YAML files. The data output from your dbt project is then available for exploring and sharing in Seeker.

- No more scattered, duplicated metrics across multiple tools  
- No more time spent trying to maintain data changes in both dbt and and your data viz tools  
- 

## Getting Started
---

### Installation

Seeker requires node.js and yarn.

**Install dependencies for Mac OS**
```shell
# Install node with homebrew
brew install node

# Install yarn with node package manager
npm install -g yarn

# Clone the seeker repo
git clone https://github.com/hubble-data/seeker

# Enter the repo directory
cd seeker

# Install seeker dependencies and build
yarn install
yarn build
```

### Usage

```shell
# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_PATH = /Users/myuser/dbtrepo

# Build and run seeker
yarn start

# Press ALLOW when asked to "accept incoming connections from python"
```
