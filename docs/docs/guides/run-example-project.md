---
sidebar_position: 1
---

# Run the example project

In this guide you'll setup lightdash with some fictional data. You don't need an existing dbt project or data warehouse.

## 1. Install docker

Head over to the [Docker docs](https://docs.docker.com/get-docker/) and install the latest version of docker.

## 2. Clone lightdash

Download the lightdash code:

```shell
git clone https://github.com/lightdash/lightdash
```

## 3. Start up the demo with docker

The following command will create a lightdash instance, a dbt project containing demo data, and a postgres database to act as a demo data warehouse

```shell
cd lightdash/examples/full-jaffle-shop-demo
docker compose up
```

The command will take some time to run (while it builds the docker containers). dbt will setup the data warehouse with the demo data. The demo is ready when you see `Completed Successfully` appear twice:

![screenshot-terminal-demo-ready](assets/screenshot-terminal-demo-ready.png)

## 4. Open lightdash

Once the demo data is ready, open [https://localhost:8080](https://localhost:8080) in your browser.
