# Personal access tokens

:::caution

This document is a draft of an experimental feature

:::

You can create a personal access token (PAT) to use in the [CLI](../get-started/setup-lightdash/lightdash-cli.mdx) or
with the API.

To provide additional security, we highly recommend adding an expiration to your personal access tokens.

Notes:

* Everybody in your organization can create a personal access token (PAT)
* Not all the endpoints will be accessible with PAT authentication

### How to authenticate

The PAT authentication is done via the HTTP Authorization request header.

```
Authorization: ApiKey <token>
```

Examples:

```
curl --location --request GET 'https://my.lightdash.com/api/v1/org/projects' \
--header 'Authorization: ApiKey eeaa81d8bcd89a770bd8a581cabd052b'
```

```
GET /api/v1/org/projects HTTP/1.1
Host: my.lightdash.com
Authorization: ApiKey eeaa81d8bcd89a770bd8a581cabd052b
```


### Available endpoints

**Soon to come**
