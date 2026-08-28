# Enterprise Edition

Lightdash Enterprise Edition (EE) is enabled at startup when
`LIGHTDASH_LICENSE_KEY` contains a valid Keygen license. Without a license key,
Lightdash starts as Community Edition. By default, the backend validates the
key through Keygen or the configured Lightdash validation proxy.

## Offline license validation

For deployments without network access, set
`LIGHTDASH_LICENSE_CERTIFICATE` to the base64-encoded contents of the signed
Keygen certificate. Both environment variables are required. Filesystem paths
are not supported.

When a certificate is configured, Lightdash validates it locally without a
network request or online fallback. An invalid, expired, or tampered
certificate prevents startup. A certificate checked out with no TTL never
expires. If the certificate is valid but the license it carries has lapsed or
been revoked, Lightdash starts as Community Edition, matching online
validation. License validation occurs only at startup, so restart all backend
processes after changing either value.
