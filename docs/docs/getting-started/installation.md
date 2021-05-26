---
sidebar_position: 1
---

# Installation

## Quickstart with docker

The fastest way to get started is to use [Docker](https://docs.docker.com/get-docker/).

### Install Docker
You can install docker [here](https://docs.docker.com/get-docker/).

Once you've installed Docker, make sure to open the app so that it's running in the background.

### Clone the lightdash repo

```bash
# Clone the lightdash repo
git clone https://github.com/lightdash/lightdash

# Enter the repo directory
cd lightdash

# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_DIR=/Users/myuser/dbtrepo
```

### Launch lightdash

If you're NOT using BigQuery:

```bash
# Build and launch lightdash
docker-compose -f docker-compose.yml up

# Ready on http://localhost:8080 !
```

If you're using BigQuery:

```bash
# Build and launch lightdash
docker-compose -f docker-compose.yml -f docker-compose.gcloud.yml up

# Ready on http://localhost:8080 !
```

---

## Installation from source

lightdash requires node.js and yarn.

### Install dependencies for Mac OS

```bash
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

### Specify the path to your dbt project

```bash
# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_DIR)=/Users/myuser/dbtrepo
```

### Launch lightdash
```
# Build and run lightdash
yarn start

# Press ALLOW when asked to "accept incoming connections from python"
```
