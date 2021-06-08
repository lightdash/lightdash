---
sidebar_position: 1
---
# FAQs

## I can't find my answer in your docs and I still need help!
---
No worries! You can [open an issue in GitHub](https://github.com/lightdash/lightdash/issues/new/choose) and we'll get back to you as soon as we can 🙂

## What metric types are there?
---
Check out our [metrics reference doc](https://docs.lightdash.com/references/metrics).

## What dimension types do you support?
---
Check out our [dimensions reference doc](https://docs.lightdash.com/references/dimensions).

## I want to report a bug/request a feature
---
Team work makes the dream work 💪 If you want to report a bug or request a feature, [open an issue in GitHub](https://github.com/lightdash/lightdash/issues/new/choose).

## Installation error: invalid mount config for type "bind": bind source path does not exist.
---
After running: `docker compose up`, if you get the error:

```
Error response from daemon: invalid mount config for type "bind":
bind source path does not exist: /tmp/seeker/dbt
```

This means you haven’t set your `DBT_PROJECT_DIR`.

In your terminal, run the following (replacing the path with the path to your dbt project):

```
# Specify the path to your dbt project
# (i.e. the directory containing dbt_project.yml)
# You MUST use the absolute path (i.e no ../../myrepo)
export DBT_PROJECT_DIR=/Users/myuser/dbtrepo
```

## Lightdash crashed! How can I find out what happened?
---
If you launched via `yarn start`:
1. Check the javascript console in your browser
  - Safari: `opt-cmd-c`

2. Check the terminal where you ran yarn start
  - Errors from the dbt server will show in json blobs with a "state": "ERROR" flag
  - Errors from the Lightdash server are anything that doesn't look like a json blob

## Command "docker-compose" not found
---
When trying to launch Lightdash, if you get a `docker-compose not found` error message, this is likely because the Docker app isn't running.

Docker needs to be running on your device before you can launch Lightdash. To do this, just open the Docker app.

## ECONNREFUSED error (port already in use)
If you get an error message that looks something like:
`Couldn't connect to dbt: FetchError: request to http://0.0.0.0.:8580/jsonrpc failed, reason: connect ECONNREFUSED 0.0.0.:8580`

This is likely because the 8080 port that is used to launch Lightdash locally is in use. To fix this error, run the following command in your terminal:
```
lsof -i tcp:8080 # this will find the process using 8080
```

You should see a bunch of things returned. You want to copy the PID that's listed, then run:
```
kill -9 <pid> # kills the process with the given PID (i.e. the one using 8080)
```
