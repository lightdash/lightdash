# Security advisory runbook

Use this checklist for every Lightdash vulnerability disclosure and every
material correction to a published advisory.

## Triage automated drafts

The private AI security automation and its operating instructions live in the
`lightdash/lightdash-internal-agents` repository. Maintainers with access must
review every automated draft there before continuing with this disclosure
runbook; the automation never requests a CVE or publishes an advisory.

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
