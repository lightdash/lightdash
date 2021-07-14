---
sidebar_position: 1
sidebar_label: Setup the demo project
---

# Setup Lightdash with the demo dbt project

In this tutorial, you'll setup Lightdash and connect it to a demo dbt project containing some fake data.
This is the fastest way to play with Lightdash on your local machine. The final result will look exactly like
[https://demo.lightdash.com](https://demo.lightdash.com).

**Prerequisites**
* You must have [git](https://git-scm.com) installed. If you don't have git installed you can find [many great guides online](https://www.linode.com/docs/guides/how-to-install-git-on-linux-mac-and-windows/).

## 1. Install and run docker desktop

:::info

You must have docker desktop >3.0.0 installed, please check any existing installation

:::

You can install docker desktop for your system [here](https://docs.docker.com/get-docker/). Once you've installed Docker, you must also [run the docker application](https://docs.docker.com/get-docker/).

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
git clone --recurse-submodules https://github.com/lightdash/lightdash

# A new directory called "lightdash" should appear
```

## 3. Start the demo project and dependencies

When you run the code block below, 3 services will be started:
* A test data warehouse (postgres)
* A demo dbt project containing fake data
* A fully functional Lightdash instance for exploring the data

This command might take a while to run depending on your internet speed, while it downloads Lightdash and it's dependencies.

```shell
# Change directories into the demo directory
cd ./lightdash/examples/full-jaffle-shop-demo

# Run docker compose
docker compose up

# If you see
# > Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running
# then docker isn't running

# If you see
# > Compose is not a valid docker command
# You have an older version of docker, please upgrade to docker >3.0.0
```

## 4. Launch the Lightdash app

When you see the following in your terminal, open up the app at [http://localhost:8080](http://localhost:8080).

```text
lightdash_1  | ------------------------------------------
lightdash_1  | Launch Lightdash at http://localhost:8080
lightdash_1  | ------------------------------------------
```


If you see the following error message:
```text
Error response from daemon: Ports are not available: listen tcp 0.0.0.0:8080: bind: address already in use"
```
Then change `LIGHTDASH_PORT` and reopen the app at `http://localhost:xxxx` where `xxxx` is the port you choose.


## Next steps

Learn how to start exploring data with Lightdash:
* Run a query
* Create a chart
* Export query results

Get familiar with customising dimensions and metrics by editing the demo files:
* [How to create dimensions](../guides/how-to-create-dimensions.md)
* [How to create metrics](../guides/how-to-create-metrics.md)

Or connect up your own dbt project:
* [Setup an existing dbt project](setup-a-local-dbt-project.md)
