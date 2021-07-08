---
sidebar_position: 2
sidebar_label: Setup an existing dbt project
---

# Setup Lightdash with your existing dbt project

In this tutorial, you'll setup Lightdash and connect it to your existing dbt project. You should already be familiar
with dbt. At the end of the tutorial you'll be able to use the Lightdash UI to start exploring your dbt project and
run queries.

**Prerequisites**
* You need an existing [dbt](https://www.getdbt.com/) project on your local machine
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
git clone git@github.com:lightdash/lightdash.git

# A new directory called "lightdash" should appear
```

## 3. Open your dbt project in a terminal

Navigate to the dbt project you want to explore with Lightdash

```shell
# Go to your project
cd /path/to/my/dbt/project

# List the files, it should contain your dbt_project.yml
ls
# > dbt_project.yml
```

## 4. Start Lightdash service

### For users using a local database

You must modify your `profiles.yml` file to connect to a local database (e.g. postgres running on your laptop).

1. Copy your profiles directory. For example if your `profiles.yml` is at `~/.dbt/profiles.yml` run `cp ~/.dbt ~/.lightdash`
2. Edit `~/.lightdash/profiles.yml` by replacing `localhost` with `host.docker.internal`. These usually appear under the `host:` field.
3. Launch Lightdash with docker, which accepts the following options:

* Your dbt project location, we set this to the current directory `${PWD}`
* Your new dbt `profiles.yml` location `~/.lightdash`
* A port to expose Lightdash on. By default we use `8080`.

**Set your variables (you only need to do this the first time you launch Lightdash!):**
```shell
export DBT_PROJECT_DIR=${PWD}
export DBT_PROFILES_DIR=${HOME}/.lightdash
export LIGHTDASH_PORT=8080
```

**Launch Lightdash:**
```
docker run -it -p "${LIGHTDASH_PORT}:8080" -v "${DBT_PROJECT_DIR}:/usr/app/dbt" -v "${DBT_PROFILES_DIR}:/usr/app/profiles" -v lightdash/lightdash
```

### For bigquery users

Launch Lightdash with docker, which accepts the following options:

* Your dbt project location, we set this to the current directory `${PWD}`
* Your dbt `profiles.yml` location, by default we use `${HOME}/.dbt` if you know that it's different please update this value below
* If your [bigquery profile](https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile) uses `method: oauth` you need to know your gcloud sdk config location. By default we use `${HOME}/.config/gcloud`.
* A port to expose Lightdash on. By default we use `8080`.

**Set your variables (you only need to do this the first time you launch Lightdash!):**
```shell
export DBT_PROJECT_DIR=${PWD}
export DBT_PROFILES_DIR=${HOME}/.dbt
export GCLOUD_CONFIG_DIR=${HOME}/.config/gcloud
export LIGHTDASH_PORT=8080
```

**Launch Lightdash:**
```shell
docker run -it -p "${LIGHTDASH_PORT}:8080" -v "${DBT_PROJECT_DIR}:/usr/app/dbt" -v "${DBT_PROFILES_DIR}:/usr/app/profiles" -v "${GCLOUD_CONFIG_DIR}:/root/.config/gcloud" lightdash/lightdash
```

### For all other users

Launch Lightdash with docker, which accepts the following options:

* Your dbt project location, we set this to the current directory `${PWD}`
* Your dbt `profiles.yml` location, by default we use `${HOME}/.dbt` if you know that it's different please update this value below
* A port to expose Lightdash on. By default we use `8080`.

**Set your variables (you only need to do this the first time you launch Lightdash!):**
```shell
export DBT_PROJECT_DIR=${PWD}
export DBT_PROFILES_DIR=${HOME}/.dbt
export LIGHTDASH_PORT=8080
```

**Launch Lightdash:**
```
docker run -it -p "${LIGHTDASH_PORT}:8080" -v "${DBT_PROJECT_DIR}:/usr/app/dbt" -v "${DBT_PROFILES_DIR}:/usr/app/profiles" lightdash/lightdash
```

## 5. Launch the Lightdash app

When you see the following in your terminal, open up the app at [http://localhost:8080](http://localhost:8080).

```text
lightdash_1  | ------------------------------------------
lightdash_1  | Launch lightdash at http://localhost:8080
lightdash_1  | ------------------------------------------
lightdash_1  | {"timestamp": "2021-06-02T16:03:33.770878Z", "message": "Running with dbt=0.19.1", "channel": "dbt", "l...
lightdash_1  | {"timestamp": "2021-06-02T16:03:34.300057Z", "message": "Serving RPC server at 0.0.0.0:8580, pid=35", "...
lightdash_1  | {"timestamp": "2021-06-02T16:03:34.303841Z", "message": "Supported methods: ['cli_args', 'compile', 'co...
lightdash_1  | {"timestamp": "2021-06-02T16:03:34.305703Z", "message": "Send requests to http://localhost:8580/jsonrpc...
```


If you see the following error message:
```text
Error response from daemon: Ports are not available: listen tcp 0.0.0.0:8080: bind: address already in use"
```
Then change `LIGHTDASH_PORT` and reopen the app at `http://localhost:xxxx` where `xxxx` is the port you choose.

## Next steps

Start adding dimensions, metrics, and joins to your dbt tables:

* [How to create dimensions](../guides/how-to-create-dimensions.md)
* [How to create metrics](../guides/how-to-create-metrics.md)
* [How to join tables](../guides/how-to-join-tables.md)

Learn how to start exploring data with Lightdash:
* Run a query
* Create a chart
* Export query results
