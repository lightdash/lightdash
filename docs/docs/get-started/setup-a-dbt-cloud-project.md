---
sidebar_position: 3
sidebar_label: Setup a dbt cloud project
---

# Setup Lightdash to connect to your dbt cloud project

In this tutorial, you'll setup Lightdash and connect it to your dbt project on [dbt cloud](https://cloud.getdbt.com).
dbt cloud provides a development environment that makes it really easy to your develop your dbt project code, with 
Lightdash you can also visualise your dbt models while developing you code.

**Prerequisites**
 - A dbt cloud account. If you don't have one, [sign up for a free here](https://cloud.getdbt.com/signup/)
 - Your dbt cloud account should have at least one environment (data warehouse) configured
 - Your dbt cloud account environment should be using dbt version `0.20.0` or higher

## 1. Get your `account_id` and `project_id`

Login to [dbt cloud](https://cloud.getdbt.com) and follow these instructions to get your account and project id:

1. Make sure you have the correct project selected in the drop down settings
2. Get your `account_id` from the URL after `/accounts/`
3. Get your `project_id` from the URL after `/projects/`

![screenshot](assets/dbt-cloud-account-project.png)

## 2. Get your `environment_id`

Use the sidebar to see all your environments. To connect to your dbt IDE you must select your development credentials with
type `type: development`. This should be the environment you usually use when developing in the dbt cloud IDE.

![screenshot](assets/dbt-cloud-sidebar.png)

![screenshot](assets/dbt-cloud-env-select.png)

Once you've located your environment follow these steps to get your environment id:

1. Get your `environment_id` from the URL after `/environments/`
2. Check that your environment is using dbt `0.20.0` or above (you can change this in environment settings)

![screenshot](assets/dbt-cloud-env-details.png)

## 3. Get your `api_key`

You can get your personal api key by visiting your [API Access - Your profile](https://cloud.getdbt.com/#/profile/api/).

:::info

**It's a secret!** Remember to keep your api key safe as it enables access to your dbt cloud account.

:::

## 4. Create your lightdash.yml file

Use `account_id`, `project_id`, `environment_id`, and `api_key` from the previous steps and create a file called `lightdash.yml`

```yaml
# lightdash.yml
version: '1.0'

projects:
  - name: 'default'
    type: 'dbt_cloud_ide'
    account_id: # your id
    project_id: # your id
    environment_id: # your id
    api_key: # your api key
```

## 5. Launch your dbt cloud development environment

Open your development environment in [dbt cloud](https://cloud.getdbt.com).

![screenshot](assets/dbt-cloud-develop.png)

## 6. Launch lightdash

Launch Lightdash using docker

```shell
export LIGHTDASH_CONFIG_FILE=/path/to/your/lightdash.yml
export LIGHTDASH_PORT=8080

docker run -it -p "${LIGHTDASH_PORT}:8080" -v "${LIGHTDASH_CONFIG_FILE}:/usr/app/lightdash.yml" lightdash/lightdash
```

When you see the following in your terminal, open up the app at [http://localhost:8080](http://localhost:8080).

```text
lightdash_1  | ------------------------------------------
lightdash_1  | Launch Lightdash at http://localhost:8080
lightdash_1  | ------------------------------------------
```

:::warn

Lightdash will only connect to your development environment while you have the dbt cloud development
environment open in your browser. Once you finish developing, lightdash won't be able to connect.

:::


If you see the following error message:
```text
Error response from daemon: Ports are not available: listen tcp 0.0.0.0:8080: bind: address already in use"
```
Then change `LIGHTDASH_PORT` and reopen the app at `http://localhost:xxxx` where `xxxx` is the port you choose.
