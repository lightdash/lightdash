# Security advisory runbook

Use this checklist for every Lightdash vulnerability disclosure and every
material correction to a published advisory.

## Triage automated drafts

This runbook is for maintainers. This section defines how to handle private
drafts created by the `AI Security Advisory Drafts` workflow so an AI result
cannot bypass the normal disclosure checks. The workflow never requests a CVE
or publishes an advisory.

The scan runs after release, when the diff is already public. It is only a
backstop for unnoticed security fixes, not a replacement for coordinated private
disclosure. Before accepting an automated draft, verify:

- that the change fixes an exploitable vulnerability rather than ordinary
  hardening;
- the attacker prerequisites, impact, CVSS vector, severity, and CWE identifiers;
- the first affected, last vulnerable, and first patched versions for every
  affected product;
- the workaround or the statement that no workaround is available;
- the GitHub release, Docker tag, and immutable image digest; and
- the remediation instructions and private review evidence.

A candidate can create a draft only when the first analysis classifies it as a
high-confidence exploitable vulnerability, verifies its introduction version,
provides a complete CVSS v3.1 base vector, and selects a specific primary CWE.
A fresh skeptical review must then inspect the previous release and independently
confirm that existing controls do not prevent effective security impact.

The workflow requires the existing `ANTHROPIC_API_KEY`, a
`SECURITY_ALERTS_SLACK_WEBHOOK_URL`, and a `SECURITY_ADVISORY_TOKEN`. The latter
must be a fine-grained personal access token restricted to this repository with
Repository security advisories read and write access. The token owner must remain
a repository administrator or organization security manager. Set an expiration,
record its owner, and rotate it before it expires.

The `Security Advisory Triage Reminder` workflow checks the repository every day
at 10:00 Europe/Lisbon. When one or more advisories are in GitHub's `triage`
state, it posts their titles and private links to `#security-alerts` using the
same token and webhook.

Close false-positive or duplicate drafts. For an accepted draft, request the CVE
while it remains private, complete every field required below, and follow the
publication order. For vulnerabilities known before release, create the private
advisory before making the fix public.

## Prepare the fix and advisory

- Create a private GitHub repository security advisory and request the CVE
  while the advisory is still private.
- Develop and verify the fix without disclosing the vulnerability in public
  issues, pull requests, commit messages, or release notes.
- Calculate the CVSS severity and add the relevant CWE identifiers.
- Identify the last vulnerable version and first patched version. Use GitHub's
  supported version-range syntax and verify both boundary versions.
- Add a workaround when one exists. State explicitly when no workaround is
  available.

Use these affected-product identifiers consistently:

| Product                                       | Ecosystem | Package name          |
| --------------------------------------------- | --------- | --------------------- |
| Lightdash server and official container image | Other     | `lightdash/lightdash` |
| Lightdash CLI                                 | npm       | `@lightdash/cli`      |

Do not use the unscoped npm package `lightdash`; it is unrelated to this
project.

The advisory must contain all of the following before publication:

- GHSA identifier and reserved CVE identifier;
- summary, impact, CVSS severity, and CWE identifiers;
- affected range and first patched version;
- workaround or an explicit statement that none is available;
- fixed GitHub release URL;
- fixed Docker tag and immutable image digest for server vulnerabilities; and
- clear upgrade or remediation instructions.

## Publish in order

Complete these steps in one coordinated release window:

1. Publish the patched GitHub release and versioned Docker image.
2. Verify the release, Docker tag, and image digest are publicly retrievable.
3. Publish the GitHub Security Advisory/CVE.
4. Verify the public API returns the correct advisory metadata.

Useful release checks:

```bash
version=0.0.0

gh release view "$version" --repo lightdash/lightdash
docker buildx imagetools inspect "lightdash/lightdash:$version"
```

Record the immutable Docker digest from `imagetools inspect` in the advisory.
Do not treat the mutable `latest` tag as evidence that the fixed artifact is
available.

## Verify publication

The public endpoint must work without authentication:

```bash
ghsa_id=GHSA-xxxx-xxxx-xxxx

curl --fail-with-body --silent --show-error \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  'https://api.github.com/repos/lightdash/lightdash/security-advisories?state=published&sort=updated&direction=desc&per_page=100' |
  jq --arg ghsa_id "$ghsa_id" '.[] | select(.ghsa_id == $ghsa_id)'
```

Check that the result includes the CVE, severity, `html_url`, affected product,
affected range, patched version, `published_at`, `updated_at`, and a null
`withdrawn_at`. Save the response `ETag` and confirm a request using
`If-None-Match` returns HTTP `304`.

Test the version boundaries with the same SemVer library used by the consuming
monitor:

- the last vulnerable version matches the affected range;
- the first patched version does not match;
- an advisory without a fixed version remains active;
- a newer `updated_at` value or changed normalized content hash produces a new
  notification; and
- a non-null `withdrawn_at` resolves or annotates the notification.
