---
sidebar_position: 8
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
|`SITE_URL` | Site url where Lightdash is being hosted. It should include the protocol. E.g https://lightdash.mycompany.com | | |

Lightdash also accepts all [standard postgres environment variables](https://www.postgresql.org/docs/9.3/libpq-envars.html)

# SMTP environment variables

This is a reference to all the SMTP environment variables that can be used to configure a Lightdash email client.

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
|`EMAIL_SMTP_HOST`| Hostname of email server | ✅ | |
|`EMAIL_SMTP_PORT` | Port of email server | | 587 |
|`EMAIL_SMTP_SECURE` | Secure connection | | true |
|`EMAIL_SMTP_USER` | Auth user | ✅ | |
|`EMAIL_SMTP_PASSWORD` | Auth password | [1] | |
|`EMAIL_SMTP_ACCESS_TOKEN` | Auth access token for Oauth2 authentication | [1] | |
|`EMAIL_SMTP_ALLOW_INVALID_CERT` | Allow connection to TLS server with self-signed or invalid TLS certificate | | false |
|`EMAIL_SMTP_SENDER_EMAIL` | The email address that sends emails | ✅ | |
|`EMAIL_SMTP_SENDER_NAME` | The name of the email address that sends emails | | Lightdash |

[1] `EMAIL_SMTP_PASSWORD` or `EMAIL_SMTP_ACCESS_TOKEN` needs to be provided

# SSO environment variables

These variables enable you to control Single Sign On (SSO) functionality.

| Variable                               | Description                                          | Required? | Default |
|----------------------------------------|------------------------------------------------------|-----------|------|
| `AUTH_DISABLE_PASSWORD_AUTHENTICATION` | If `"true"` disables signing in with plain passwords | | false |
| `AUTH_GOOGLE_OAUTH2_CLIENT_ID`         | Required for Google SSO                              | |      |
| `AUTH_GOOGLE_OAUTH2_CLIENT_SECRET`     | Required for Google SSO                              | |      |
| `AUTH_OKTA_OAUTH2_CLIENT_ID`           | Required for Okta SSO                                | |      |
| `AUTH_OKTA_OAUTH2_CLIENT_SECRET`       | Required for Okta SSO                                | |      |
| `AUTH_OKTA_OAUTH2_ISSUER`              | Required for Okta SSO                                | |      |
| `AUTH_OKTA_DOMAIN`                     | Required for Okta SSO                                | |      |
