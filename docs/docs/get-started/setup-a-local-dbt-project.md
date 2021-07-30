---
sidebar_position: 2
sidebar_label: Setup a local dbt project
---

# Setup Lightdash with your existing dbt project

In this tutorial, you'll setup Lightdash and connect it to your existing dbt project. You should already be familiar
with dbt. At the end of the tutorial you'll be able to use the Lightdash UI to start exploring your dbt project and
run queries.

**Prerequisites**
* You need an existing [dbt](https://www.getdbt.com/) project on your local machine. The project should be compatible with dbt version `0.20.0` or higher.
* Your dbt project [profiles.yml file needs to be configured](https://docs.getdbt.com/dbt-cli/configure-your-profile) to access your database / data warehouse.
* You must know where your `profiles.yml` file is. This is usually `~/.dbt/profiles.yml` unless you've changed it.

## 1. Install docker

You can install docker for your system [here](https://docs.docker.com/get-docker/). Once you've installed Docker, you must also [run the docker application](https://docs.docker.com/get-docker/).

Check docker is running by this in your terminal:

```shell
# Check docker is running
docker info

# If the output shows:
# > Server:
# >   ERROR...
# then docker isn't running
```

## 2. Clone the Lightdash repository

Clone the Lightdash code to your local machine. This will create a new directory called `./lightdash` (the Lightdash directory).

```bash
# Clone the Lightdash repo
git clone https://github.com/lightdash/lightdash
cd lightdash
# A new directory called "lightdash" should appear
```

## 3. Launch Lightdash

:::info

If you're using dbt with bigquery or a local database (e.g. postgres running on your laptop) follow the steps at the end of this tutorial to launch Lightdash.

:::

Before you launch Lightdash you'll need the following info:

* Your dbt project location
* Your dbt `profiles.yml` location, by default this is `${HOME}/.dbt` if you know that it's different please update this value below

Fill in the two variables below and start lightdash:
```shell
export DBT_PROJECT_DIR=/path/to/dbt/project
export DBT_PROFILES_DIR=${HOME}/.dbt

docker compose up
```

When you see the following in your terminal, open up the app at [http://localhost:8080](http://localhost:8080).

```text
lightdash_1  | ------------------------------------------
lightdash_1  | Launch lightdash at http://localhost:8080
lightdash_1  | ------------------------------------------
```

If you see the following error message:
```text
Error response from daemon: Ports are not available: listen tcp 0.0.0.0:8080: bind: address already in use"
```
Then set the `PORT` variable to any port of your choice and reopen the app at `http://localhost:xxxx` where `xxxx` is the port you choose:

```shell
PORT=xxxx docker compose up
```

## Next steps

Start adding dimensions, metrics, and joins to your dbt tables:

* [How to create dimensions](../guides/how-to-create-dimensions.md)
* [How to create metrics](../guides/how-to-create-metrics.md)
* [How to join tables](../guides/how-to-join-tables.md)

Learn how to start exploring data with Lightdash:
* Run a query
* Create a chart
* Export query results

## Launch lightdash for a local databases

To launch Lightdash, you'll need to modify your `profiles.yml` file to connect to a local database (e.g. postgres running on your laptop).

1. Copy your profiles directory. For example if your `profiles.yml` is at `~/.dbt/profiles.yml` run `cp ~/.dbt ~/.lightdash`
2. Edit `~/.lightdash/profiles.yml` by replacing `localhost` with `host.docker.internal`. These usually appear under the `host:` field.
3. Before you launch Lightdash you'll need the following info:

* Your dbt project location
* Your dbt `profiles.yml` location, by default this is `${HOME}/.dbt` if you know that it's different please update this value below

Fill in the two variables below and start lightdash:
```shell
export DBT_PROJECT_DIR=/path/to/dbt/project
export DBT_PROFILES_DIR=${HOME}/.dbt

docker compose up
```

## Launch lightdash for bigquery users

Before you launch Lightdash you'll need the following info:

* Your dbt project location
* Your dbt `profiles.yml` location, by default this is `${HOME}/.dbt` if you know that it's different please update this value below
* If your [bigquery profile](https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile) uses `method: oauth` you need to know your gcloud sdk config location. By default we use `${HOME}/.config/gcloud`.
* If your [bigquery profile](https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile) uses `method: service-account` you need to know your key file location.

**Launch Lightdash with method: oauth:**

```shell
export DBT_PROJECT_DIR=/path/to/dbt/project
export DBT_PROFILES_DIR=${HOME}/.dbt
export GCLOUD_CONFIG_DIR=${HOME}/.config/gcloud

docker compose -f docker-compose.yml docker-compose.oauth.yml up
```

**Launch Lightdash with method: service-account:**
```shell
export DBT_PROJECT_DIR=/path/to/dbt/project
export DBT_PROFILES_DIR=${HOME}/.dbt
export KEY_FILE_PATH=/path/to/file.json # the same path you have in the dbt profiles.yml

docker compose -f docker-compose.yml docker-compose.service-account.yml up
```
