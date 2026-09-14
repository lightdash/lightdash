# Security Policy

## Supported versions

Security fixes are delivered in the latest stable Lightdash release unless a
published advisory explicitly identifies a supported backport. There is no LTS
release line.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to security@lightdash.com.
Do not open a public issue.

Include the affected component and version, impact, reproduction steps, and any
known mitigations. We will acknowledge the report, investigate it, and
coordinate disclosure with the reporter. Vulnerabilities classified as high
(CVE) or above will be remedied within 7 days.

## Published advisories

[GitHub Security Advisories](https://github.com/lightdash/lightdash/security/advisories)
are the canonical source for published Lightdash vulnerabilities. Each advisory
identifies affected versions, the first patched version, severity, mitigation,
and upgrade information.

Self-hosted operators should not rely on Docker Hub or Docker Scout for
notification. Container scanners can provide useful supplemental findings, but
pulling an image does not subscribe an operator to security updates and running
containers do not update automatically.

### Machine-readable monitoring

DevOps teams can opt in by polling GitHub's public repository-advisories API:

```text
GET https://api.github.com/repos/lightdash/lightdash/security-advisories?state=published&sort=updated&direction=desc&per_page=100
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
```

The endpoint is publicly readable without authentication. Poll at most every
six hours, follow the `Link` response header when it is present, and cache the
response with `ETag` and `If-None-Match`:

```bash
advisories_url='https://api.github.com/repos/lightdash/lightdash/security-advisories?state=published&sort=updated&direction=desc&per_page=100'
etag_value="$(cat lightdash-advisories.etag 2>/dev/null || true)"

http_code="$(curl --fail-with-body --silent --show-error \
  --dump-header lightdash-advisories.headers \
  --output lightdash-advisories.json.new \
  --write-out '%{http_code}' \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  --header "If-None-Match: $etag_value" \
  "$advisories_url")"

if [[ "$http_code" == 200 ]]; then
  mv lightdash-advisories.json.new lightdash-advisories.json
  awk 'tolower($1) == "etag:" { sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }' \
    lightdash-advisories.headers > lightdash-advisories.etag
elif [[ "$http_code" == 304 ]]; then
  rm -f lightdash-advisories.json.new
else
  exit 1
fi
```

Production integrations should keep the last observed `ghsa_id`, `updated_at`,
and a hash of the normalized advisory record and:

- alert when an advisory is new, its `updated_at` value changes, or its content
  hash changes;
- close or annotate the alert when `withdrawn_at` becomes non-null;
- evaluate every entry in `vulnerabilities` that describes the deployed
  Lightdash product;
- compare the installed version with `vulnerable_version_range` using a SemVer
  library rather than string comparison;
- treat a missing `patched_versions` value as affected until the advisory says
  otherwise; and
- link responders to `html_url`, which is the canonical human-readable
  advisory.

The content hash is required because GitHub can update affected-product
metadata without advancing `updated_at`.

An unauthenticated instance reports its running version at
`GET /api/v1/health` in `results.version`:

```bash
curl --fail --silent https://lightdash.example.com/api/v1/health |
  jq --raw-output '.results.version'
```

Operators that pin `lightdash/lightdash:<version>` may instead obtain the
version from their deployment manifest. Always pull and redeploy the patched
version; moving the Docker Hub `latest` tag does not replace a running
container.

See the
[repository security advisory API documentation](https://docs.github.com/en/rest/security-advisories/repository-advisories)
and the
[Lightdash update guide](https://docs.lightdash.com/self-host/update-lightdash)
for more information.

## Maintainer disclosure process

Maintainers publishing or correcting an advisory must follow the
[security advisory runbook](.github/docs/security-advisory-runbook.md), which
defines the required metadata, release ordering, Docker-image verification,
and post-publication checks.
