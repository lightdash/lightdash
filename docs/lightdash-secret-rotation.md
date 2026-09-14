# Rotating `LIGHTDASH_SECRET`

`LIGHTDASH_SECRET` protects everything a Lightdash instance derives from its
root secret: AES-256-GCM ciphertext at rest (warehouse credentials, dbt
connections, SSH keys, embed secrets, OAuth tokens, AI provider keys, and
more), session cookies, app-preview and persistent-download JWTs,
headless-browser HMAC authentication, and the deterministic bcrypt hashes
used to look up personal access tokens and service accounts.

This document describes how to change the active secret without downtime
using the fallback keyring, and every condition that must hold before the old
secret can be removed.

## The fallback keyring

`LIGHTDASH_SECRET_FALLBACKS` holds up to three previous secrets as a JSON
array of strings:

```env
LIGHTDASH_SECRET='the new active secret'
LIGHTDASH_SECRET_FALLBACKS='["the previous secret"]'
```

Behavior:

- **Writes always use the active secret.** New ciphertext, session cookies,
  JWTs, HMACs, and token hashes are produced only from `LIGHTDASH_SECRET`.
- **Reads try the active secret first, then each fallback in order.**
  Persisted ciphertext, session cookies, Lightdash-issued JWTs,
  headless-browser HMACs, and PAT/service-account lookups all accept values
  produced under any configured secret.
- Values are parsed as exact JSON strings: no trimming, no delimiter
  splitting. Secrets containing commas or leading/trailing whitespace
  round-trip unchanged.
- An empty array is valid. Empty-string entries, duplicates (including a
  fallback equal to the active secret), and more than three fallbacks are
  configuration errors that prevent startup.
- If Slack is configured (`SLACK_CLIENT_ID`) and fallbacks are set,
  `SLACK_STATE_SECRET` must be set explicitly. Slack OAuth state is
  deliberately excluded from rotation: pin it to the pre-rotation
  `LIGHTDASH_SECRET` so in-flight OAuth installs keep working, and rotate it
  separately if desired.

Every runtime service consumes the keyring: the API, the scheduler worker,
NATS workers, and any environment that runs migrations, seeds, or maintenance
commands. All of them must be configured identically in each phase below.

## The `rotate-lightdash-secret` command

```bash
# Source checkout (development)
pnpm -F backend rotate-lightdash-secret \
    [--execute] \
    [--batch-size 500] \
    [--table <registry-table>]

# Production container image (no src/ or tsx in the image — run the
# compiled entry with the same env as the app, including
# LIGHTDASH_SECRET, LIGHTDASH_SECRET_FALLBACKS, and the database config)
node packages/backend/dist/scripts/rotate-lightdash-secret/index.js \
    [--execute] [--batch-size 500] [--table <registry-table>]
```

Without `--execute` the command is a report-only dry run. With `--execute` it
re-encrypts fallback-encrypted values with the active secret:

- Every registered ciphertext field is scanned in bounded primary-key
  batches. Rows already encrypted with the active secret are untouched.
  Updates are compare-and-swap (they match both the row identity and the
  original ciphertext); a concurrent modification is recorded as a skip, not
  an error.
- Queued `createProjectWithCompile` jobs (which carry encrypted project
  credentials in the job queue) are re-encrypted only while unlocked, guarded
  against concurrent workers.
- PAT and service-account hashes are classified as active, per-fallback,
  legacy sha256, or unknown. The command never rewrites token hashes: the
  plaintext token is not stored and cannot be re-hashed offline. Hashes
  produced under a fallback keep verifying only while that fallback stays
  configured; the affected credentials must be reissued or revoked before
  the fallback is removed.
- Signed download links are not scanned or reported: a link stops working
  once the secret that signed it is no longer in the configured secrets.
  Links are time-bounded (default expiry 3 days via
  `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS`, with per-channel
  `_EMAIL`/`_SLACK`/`_MSTEAMS` overrides that may be configured longer),
  so the time-based removal gate below covers them.
- Unreadable values (decryptable by no configured secret) are reported with
  their primary keys, never modified or deleted, and cause a non-zero exit
  after the full report completes.

The command prints an explicit blocker list. **A successful exit does not
mean the old secret can be removed** — only an empty blocker list plus the
time-based gates below mean that.

## Normal rotation runbook

### Phase 0 — preparation

1. Deploy a keyring-capable release to every service while keeping the
   current secret active and configuring no fallbacks.
2. If Slack is configured, set `SLACK_STATE_SECRET` explicitly to the current
   `LIGHTDASH_SECRET` and complete that rollout before configuring any
   fallback.
3. Configure the **proposed new secret as the first fallback** of the current
   active secret, and roll every service:

   ```env
   LIGHTDASH_SECRET='old secret'
   LIGHTDASH_SECRET_FALLBACKS='["new secret"]'
   ```

   This phase changes no writes; it proves every replica consumes keyring
   configuration and can read material produced under either secret.

### Phase 1 — active-key rollout

4. Atomically swap the ordering so the new secret is active and the old
   secret is the fallback:

   ```env
   LIGHTDASH_SECRET='new secret'
   LIGHTDASH_SECRET_FALLBACKS='["old secret"]'
   ```

5. Roll every API replica, scheduler worker, NATS worker, and
   migration/maintenance environment. During the mixed-replica window both
   orderings read each other's output.
6. Record the timestamp at which the **final old-active replica stopped**.
   Do not run the migration command in execute mode before this point.

### Phase 2 — convergence

7. Run the maintenance command: dry run, then execute, then dry run again.
   Repeat after any run that reports concurrent skips or when new
   fallback-encrypted work appears (for example a queued project creation
   from just before the rollout).

### Phase 3 — old-secret removal gates

Remove the old fallback only when **all** of the following hold:

- The final dry run reports **zero fallback-encrypted ciphertext**, **zero
  unreadable ciphertext**, **zero concurrent skips**, and **zero eligible
  fallback-encrypted queued jobs**.
- **Zero PAT or service-account hashes** are classified under the old
  fallback. Token hashes never converge on their own: every credential the
  dry run reports under the old fallback must be reissued (rotated by its
  owner) or revoked, and that decision recorded. A token whose hash still
  depends on the old secret stops working the moment the old secret is
  removed.
- At least the configured session-cookie lifetime (`COOKIES_MAX_AGE_HOURS`,
  default 24h) has elapsed since the rollout-completion timestamp, so no
  valid session cookie signed with the old secret remains.
- At least one hour has elapsed since the rollout-completion timestamp, so
  every app-preview JWT signed with the old secret has expired.
- Signed download links minted before the rollout have either expired or
  their breakage is explicitly accepted: a link stops working the moment
  the secret that signed it leaves the configured secrets. The waiting
  period is the **largest configured expiration** across
  `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS` and its
  `_EMAIL`/`_SLACK`/`_MSTEAMS` overrides (default 3 days) — check the
  instance configuration rather than assuming the default.

Then remove the fallback, roll every replica, and run a final steady-state
dry run to confirm nothing regressed.

### Rollback

While both secrets remain configured, rollback is a pure ordering swap: make
the old secret active and the new secret the fallback. Both orderings read
each other's output, so this is safe at any point before the fallback is
removed. If new-active ciphertext was already written or migrated, keep the
new secret configured as the fallback and rerun the maintenance command to
converge back toward the restored old active secret before removing the new
one.

## Compromised-secret rotation

When the old secret must be retired as fast as possible:

1. Complete the active-key rollout immediately (phases 0–1 compressed;
   phase 0 step 3 can be skipped if the fleet is known to run a
   keyring-capable release).
2. Run the maintenance command in execute mode as soon as the last
   old-active replica stops — do not wait for natural convergence.
3. Rotate or revoke every PAT and service account still classified under the
   compromised fallback.
4. Decide explicitly which time-based artifacts to preserve. Waiting the full
   session lifetime keeps users logged in but extends the window in which a
   stolen old secret can forge session cookies; removing the fallback early
   logs those sessions out. The same tradeoff applies to signed download
   links.
5. Remove the compromised fallback and roll every replica.

The command remains report-only toward credentials in this scenario:
revocation is an operator action through the normal credential-management
surfaces.

## Notes for operators

- The PAT session cache keys entries by the active secret, so cached entries
  from before the rollout simply miss after it; no cache flush is needed.
- A credential whose hash still derives from the old secret pays an extra
  hashing round on every authentication for as long as the fallback is
  configured. Reissue high-traffic tokens early in the overlap window
  rather than leaving them on the blocker list.
- Legacy sha256 token hashes (from very old Lightdash versions) do not
  depend on `LIGHTDASH_SECRET`. They are reported separately and do not
  block removal; they keep verifying regardless of rotation.
- Embed JWTs are signed with per-project embed secrets and are unaffected,
  except that the stored embed secret itself is registered ciphertext and is
  migrated by the command like any other field.
- Dev tooling that mirrors the backend encryption (`sdk-test-app`,
  `scripts/dev-github-reconcile.cjs`, `scripts/k8s-dev/reconcile-github.cjs`)
  reads a single secret and should be pointed at the active secret after a
  rotation.
