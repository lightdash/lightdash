---
sidebar_position: 1
---
# FAQs

## What metric types are there?

---
Check out our [metrics reference doc](https://docs.lightdash.com/references/metrics).

## What dimension types do you support?

---
Check out our [dimensions reference doc](https://docs.lightdash.com/references/dimensions).

## I want to report a bug/request a feature

---
Team work makes the dream work 💪 If you want to report a bug or request a feature, [open an issue in GitHub](https://github.com/lightdash/lightdash/issues/new/choose).

## ECONNREFUSED error (port already in use)

---
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

## I'm using an old version of dbt, is Lightdash supported?

---
We only support dbt version `0.21.0`. Before using Lightdash, please check your project is compatible with the latest version.
