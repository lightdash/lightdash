# Seeker

### Installation

Seeker requires node.js and yarn.

**Install dependencies for Mac OS**
```shell
# Install node with homebrew
brew install node

# Install yarn with node package manager
npm install -g yarn
```

### Usage

```shell
# Clone this repo
git clone https://github.com/hubble-data/seeker

# Enter the repo directory
cd seeker

# Specify the path to your dbt project 
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_PATH = /Users/myuser/dbtrepo

# Build and run seeker
yarn start

# Press ALLOW when asked to "accept incoming connections from python"
```