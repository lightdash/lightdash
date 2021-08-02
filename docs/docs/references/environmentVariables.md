---
sidebar_position: 7
---

# Environment variables

This is a reference to all environment variables that can be used to configure a Lightdash deployment.

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
|`PGHOST`| Hostname of postgres server to store Lightdash data | ✅ | |
|`PGPORT` | Port of postgres server to store Lightdash data | ✅ | |
|`PGUSER` | Username of postgres user to access postgres server to store Lightdash data | ✅ | |
|`PGPASSWORD` | Password for `PGUSER` | ✅ | |
|`PGDATABASE` | Database name inside postgres server to store Lightdash data | ✅ | |
|`PGCONNECTIONURI`|Connection URI for postgres server to store Lightdash data in the format `postgresql://user:password@host:port/db?params`| | This is an alternative to providing the previous `PG` variables  |
|`LIGHTDASH_SECRET` | Secret key used to secure various tokens in Lightdash. This **must** be fixed between deployments. If the secret changes, you won't have access to Lightdash data. | ✅ | |
|`SECURE_COOKIES` | Only allows cookies to be stored over a `https` connection. We use cookies to keep you logged in. This is recommended to be set to `true` in production. | | `false` |
|`TRUST_PROXY` | This tells the Lightdash server that it can trust the `X-Forwarded-Proto` header it receives in requests. This is useful if you use `SECURE_COOKIES=true` behind a HTTPS terminated proxy that you can trust. | | `false` |
|`LIGHTDASH_CONFIG_FILE` | Path to a `lightdash.yml` file to configure Lightdash. This is set by default and if you're using docker you shouldn't change it. | | |

Lightdash also accepts all [standard postgres environment variables](https://www.postgresql.org/docs/9.3/libpq-envars.html)
