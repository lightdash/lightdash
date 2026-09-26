# Debian 13 image migration investigation

## Decision: defer rollout

This is a **blocked investigation, not a deployable migration**. The smallest OS-only change breaks the shipped Python/dbt matrix. `prototype.patch` preserves the attempted Dockerfile changes and proposed no-push CI checks; the active Dockerfiles and workflows remain unchanged. Do not apply/merge the migration or remove the Bookworm mitigation based on these probes alone.

Investigation date: 2026-09-24; build/probe work ran 13:14–13:42 UTC (about 28 minutes), then reporting and review, within the four-hour cap. Baseline: `4c056f790453fd3be9118851e85b0b10364d8bd6`. Maximum budget: four hours. Node major remains **24**. No application dependencies or supported dbt versions were changed, no images were pushed, and no deployments were made.

### What the prototype changes

- Switch both `node:24-bookworm-slim` bases to `node:24-trixie-slim`.
- Remove `software-properties-common` from both builder package lists. Trixie APT cannot locate it; neither Dockerfile uses `add-apt-repository`. The separate host installer in `scripts/install.sh` is unchanged.
- Extend the no-push Docker Build Test to both Dockerfiles, preserve failed-build logs, and collect package inventories, image sizes and Debian Perl checks. This workflow change is **only in the patch**, not active CI.
- Leave all nine production dbt environments and preview requirements untouched. They are extracted verbatim into [evidence/requirements.json](evidence/requirements.json).

## Base identity and packages

Tags are mutable. These are the registry resolutions observed during this investigation, not the identity of a previously deployed release:

| Image                   | Multi-platform index SHA-256                                       | Tested amd64 manifest SHA-256                                      |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `node:24-bookworm-slim` | `0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` | `5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7` |
| `node:24-trixie-slim`   | `8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe` | `b64fccfbcd1ae10d11b969a868b50e1c2530a7054813d5cdea04ac3bce551697` |

Both report Node `v24.21.0`. The repository separately pins the pnpm-managed Node runtime; that pin was not changed. Registry manifests and complete raw-node-base APT inventories are in `evidence/`.

| Measurement                                                 | Bookworm                                           | Trixie                                             |
| ----------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Base compressed layer bytes (amd64, sum of manifest layers) | 80,815,687                                         | 82,457,764                                         |
| libc in raw base                                            | `2.36-9+deb12u14`                                  | `2.41-12+deb13u4`                                  |
| perl-base in raw base                                       | `5.36.0-7+deb12u3`                                 | `5.40.1-6+deb13u1`                                 |
| Python in builder probe                                     | `3.11.2` (`python3.11` package `3.11.2-6+deb12u8`) | `3.13.5` (`python3.13` package `3.13.5-2+deb13u5`) |
| OpenSSL in builder probe                                    | `3.0.20-1~deb12u2` (`libssl3`)                     | `3.5.7-1~deb13u2` (`libssl3t64`)                   |
| Full Lightdash image size/build time                        | Not measured                                       | No complete image produced                         |

The builder inventory changes from 280 packages to 212 (including removal of `software-properties-common` and its dependency tree); raw Node bases contain 88 versus 79 packages. These counts are **not** final runtime-package reductions. Examples of APT transitions:

| Builder package | Bookworm               | Trixie                 |
| --------------- | ---------------------- | ---------------------- |
| build-essential | `12.9`                 | `12.12`                |
| libgnutls28-dev | `3.7.9-2+deb12u7`      | `3.8.9-3+deb13u4`      |
| libpq5          | `15.19-0+deb12u1`      | `17.11-0+deb13u1`      |
| libsystemd0     | `252.39-1~deb12u2`     | `257.13-1~deb13u1`     |
| fontconfig      | `2.14.1-4`             | `2.15.0-2.3`           |
| fonts-noto-cjk  | `1:20220127+repack1-1` | `1:20240730+repack1-1` |

The base layer size increase is 1,642,077 bytes (~2.0%). It is **not** the final application image size delta. Raw slim bases do not contain Python; builder inventories include APT additions and must not be confused with final runtime inventories. APT and pip resolve moving repositories: the saved package inventories/freezes are evidence, not lockfiles.

## Complete build attempts

Commands were run from the checkout with the candidate edits applied:

```sh
timeout 1200 docker buildx build --platform linux/amd64 --file dockerfile \
  --progress plain --load --tag lightdash-trixie-investigation:prod .
timeout 1200 docker buildx build --platform linux/amd64 --file dockerfile-prs \
  --progress plain --load --tag lightdash-trixie-investigation:preview .
```

Both tag-only builds failed after about 12 seconds with APT exit 100:

```text
E: Unable to locate package software-properties-common
```

After removing that package, both complete builds were retried with a 600-second limit (same options, tags `lightdash-trixie-investigation:dockerfile` and `:dockerfile-prs`):

- **Production:** failed after 32 seconds installing dbt 1.4. `psycopg2-binary==2.9.6` was downloaded as source for CPython 3.13; its build preparation failed with `Error: pg_config executable not found.`
- **Preview:** its full dbt 1.12 adapter installation completed, then the 25-GiB runner disk filled during the two Node dependency-install stages. The log was truncated and even writing the exit/time trailer failed (`No space left on device`). No successful final image resulted; this is an **environmental build blocker**, not proof of Node incompatibility. Only this investigation's identified unused caches were reclaimed; host containers/services were not restarted or removed.

See [build-failures.txt](evidence/build-failures.txt). These are times to failure, with overlapping builds/cache reuse, not comparable cold-build benchmarks. A complete Bookworm application build was not attempted after discovering the disk limit; full baseline/candidate build duration and final image size remain open.

### Architecture coverage

- `.github/workflows/post-release.yml` builds the released application for `linux/amd64`; Docker Build Test also explicitly uses `linux/amd64`.
- `docker/docker-compose.preview.yml` selects `dockerfile-prs` target `pr-runner` and does not specify a platform. The deployed preview cluster's architecture was not independently verified.
- All builds, package probes and Python/Perl checks here used **linux/amd64**. No ARM64 build or execution was tested. Multi-platform Node manifests do not establish Lightdash multi-architecture support.

## Python/dbt compatibility

`probe.py` generates isolated build-time probes using the **actual per-version pip requirements and APT builder prefix** from the Dockerfiles. Each environment is installed separately so dbt 1.4 cannot prevent testing 1.5–1.12. Each probe records installation output, `pip freeze --all`, `pip check`, direct imports of every specified adapter plus selected native dependencies, dbt version, parse and compile attempts.

The compile fixture is a credential-free two-model Postgres project with a `ref()` dependency. It uses `--no-populate-cache` and `--no-introspect` to avoid a warehouse. It is not a warehouse execution test, project sync, or seeded chart query. Old dbt versions that do not support those flags are reported as such, not as OS regressions. A successful `pip check` on an empty venv after installation failure is not compatibility evidence.

### Trixie / distro Python 3.13 results

“Pass” below means install, `pip check`, all requested direct imports, the shipped `dbt --version`, and the two-model offline parse/compile passed. It is **not** an E2E or warehouse compatibility certification.

| Environment     | Explicit adapters                                                      | Result                                                                   |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Production 1.4  | Postgres, Redshift, Snowflake, BigQuery, Databricks, Trino, ClickHouse | Install fails: psycopg2 2.9.6 / `pg_config`; remaining checks blocked    |
| Production 1.5  | Same seven                                                             | Same failure                                                             |
| Production 1.6  | Same seven                                                             | Same failure                                                             |
| Production 1.7  | Same seven                                                             | Same failure                                                             |
| Production 1.8  | Same seven + DuckDB                                                    | Install fails: pandas 2.1.4 native compilation; remaining checks blocked |
| Production 1.9  | Same eight + Athena                                                    | Pass                                                                     |
| Production 1.10 | Same nine                                                              | Pass                                                                     |
| Production 1.11 | Same nine (adapter minor versions differ; see requirements)            | Pass                                                                     |
| Production 1.12 | Same nine; core remains exactly 1.12.0                                 | Pass                                                                     |
| Preview 1.12    | Postgres, Snowflake, BigQuery, Databricks, Trino                       | Pass                                                                     |

The native import probes include psycopg2, cryptography, numpy and pyarrow. The resolved native/transitive packages (including dbt-spark, installed through Databricks) are preserved in the environment receipts. No remote adapter authentication or warehouse SQL execution was tested.

**Real project compilation:** additional Bookworm and Trixie preview probes both parsed and compiled the repository's full Jaffle Shop project with 63 models, 46 seeds, 74 data tests and 492 macros using the Postgres adapter, with database introspection/cache population disabled. Neither probe seeded data nor executed models/tests; this does not establish project sync/query behavior.

**Baseline findings, not newly introduced OS failures:** fresh Bookworm dbt 1.4 reports a direct BigQuery import circular-import error (`cannot import name 'warn_or_error' from partially initialized module 'dbt.events.functions'`), although its normal CLI version and parse pass. Its compile attempt rejects the newer offline flags. Fresh Bookworm dbt 1.6 fails both BigQuery import and `dbt --version` with `AttributeError: module 'google.cloud.bigquery._helpers' has no attribute '_CELLDATA_FROM_JSON'`; its Postgres parse/compile pass. All ten baseline installations completed; the other eight Bookworm environments passed all recorded checks. These floating-dependency/import issues were recorded, not repaired in the OS investigation. They need separate follow-up/constraints before claiming a clean shipped compatibility matrix.

### Observed blockers

1. **dbt 1.4–1.7:** all retain `psycopg2-binary==2.9.6`; all four Trixie installations fail at the missing `pg_config` source-build prerequisite. Imports/version/parse/compile then fail because dbt is absent, not because each adapter independently failed. Adding `libpq-dev` alone has not been established as sufficient: the old extension and other pinned native dependencies still need Python 3.13 validation.
2. **dbt 1.8:** `dbt-databricks~=1.8.0` constrains `pandas<2.2.0`, selecting pandas 2.1.4 source on Python 3.13. Compilation fails in generated Cython C, including `error: too few arguments to function '_PyLong_AsByteArray'`, ending in `metadata-generation-failed`. This is a Python/native dependency incompatibility, not a missing APT package. Blindly overriding pandas would violate the adapter constraint.
3. Newer environments must pass the full matrix, not just pip installation; successful probes still do not prove live warehouse/TLS/native runtime compatibility.

Detailed per-environment exit codes, durations and resolved package versions are in `evidence/python-environments.json`; selected exact failure logs are in `evidence/python-failures.txt`. Per-command duration is probe-only, not full image build time. The first Bookworm wrapper duration includes a scheduling pause to avoid overlapping large environments on the small disk.

### Limited alternative: keep Python 3.11 on Trixie

A second, **build-probe-only** attempt copied `/usr/local` from the official `python:3.11-slim-trixie` image into the Node 24 Trixie base and ran `ldconfig`. It did not change any dbt or adapter requirements. The source resolved to Python **3.11.16**, index digest `sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9`, amd64 manifest `sha256:174bec68e0451bffabbb08c7d5d21c6b253f772d81d52b9558af97bb3159b761` (saved in `evidence/python311-manifest.txt`).

- **dbt 1.4:** installation, CLI version and parse now pass. The same baseline direct BigQuery import and unsupported compile-flag failures remain; this is not a fully green environment.
- **dbt 1.8:** installation, every requested import, version, parse and offline compile all pass, including the previously failing pandas dependency.
- Only **these two environments** were tested with this alternative. No full production or preview build, final-runtime ABI check, E2E, or scan was attempted for it. The ordinary preview success above uses **distro Python 3.13**, not this alternative.

The exact generated Dockerfile delta is:

```dockerfile
FROM python:3.11-slim-trixie@sha256:da047cb8f9d1d98e5c070f5300ba9f7274e33b8fc0e5be5ed88740aed1b95ba9 AS python311
# Existing pnpm source stage stays unchanged.
FROM node:24-trixie-slim AS pnpm-base
COPY --from=python311 /usr/local /usr/local
RUN ldconfig
```

`probe.py generate` preserves/reproduces this experiment as `trixie-python311-1.4.Dockerfile` and `trixie-python311-1.8.Dockerfile`. It is deliberately **not** part of `prototype.patch` or the active Dockerfiles. This is a promising way to retain the existing support contract, not an approved distribution strategy: APT still owns Python 3.13 while `/usr/local` owns Python 3.11, and APT inventory/updates do not cover that copied interpreter. Review its digest/update lifecycle, shared-library closure, image size, SBOM/scanner coverage and behavior in **both final images**, rather than copying Bookworm binaries or assuming all nine environments work.

### Dependency/support decision needed

Two reasonable paths remain; neither is adopted into the production/preview Dockerfiles:

- **Retain the existing dbt support contract:** provide a maintained, reproducibly built/pinned Python 3.11 runtime on Trixie for older environments (with its runtime libraries and security ownership), while validating newer environments separately. Copying Bookworm venvs alone is unsafe: their interpreter paths, ABI and shared-library dependencies must also be satisfied.
- **Move all environments to Python 3.13:** upgrade or retire incompatible dbt/adapter versions and update `SupportedDbtVersions`, `DBT_VERSION_SUPPORTED_WAREHOUSES`, defaults, project configuration validation and support documentation together. This needs an explicit compatibility/deprecation decision and release-safety assessment, not silent removal of dbt 1.4–1.8.

`psycopg2`, pandas/numpy/pyarrow, cryptography/OpenSSL, Databricks/Snowflake connectors and Rust/native dbt components require attention. Node native modules (canvas/fontconfig/CJK fonts, sharp, DuckDB extensions, Polars and other native bindings) also need runtime checks against glibc 2.41 and Trixie's renamed `t64` libraries. The separate headless-browser image was not migrated by this prototype.

## Perl security and the separate backport

The [Debian security tracker for CVE-2026-48962](https://security-tracker.debian.org/tracker/CVE-2026-48962), retrieved on 2026-09-24, lists fixed Trixie source versions:

- `perl`: **5.40.1-6+deb13u1**
- `libio-compress-perl`: **2.213-1+deb13u1**

The installed Trixie builder packages `perl`, `perl-base`, `perl-modules-5.40` and `libperl5.40` were all `5.40.1-6+deb13u1`, obtained from the official `deb.debian.org` Trixie APT source (policy output saved). The independent `libio-compress-perl` package was **not installed** by the shipped builder recipe. A separate probe explicitly installed its official fixed version and tested both module copies, including the copy that shadows core Perl.

`check-perl.sh` verifies Debian 13, package version floors, the installed package's GlobMapper checksum, the active module path, and benign regression cases for literal output (an inert marker must not execute), normal capture mapping and escaping. Results:

- Core Perl GlobMapper: **PASS**.
- Optional `libio-compress-perl` plus core copy: **PASS**.
- Deliberately modified core module: **rejected** by checksum verification.
- An unowned `PERL5LIB` module shadowing the patched copies: **rejected**; the active canonical module must be one of the verified package files.
- Both official module copies have SHA-256 `dacbc6f394e736744c9f7b94cb082508cf4b9e839ca9a631fa291b463fa55705` in this probe. The CI proposal checks package-owned checksums rather than permanently pinning this digest, so subsequent official security updates are not blocked.

This validates the fix in the **APT builder probe**, not an unavailable final image. The proposed workflow repeats the checks on each final production/preview image. Source context: [upstream GlobMapper fix](https://github.com/pmqs/IO-Compress/commit/f2db247bf90d4cc7ee2710be384946081f3b4610).

At this base commit, `docker/security/perl-bookworm/`, both backport hooks, and the Bookworm-specific workflow assertions **do not exist**. They belong to the separate backport PR, which has not been adopted, edited or merged here. There is nothing to delete in this checkout. If that PR lands first, reconcile the prototype against the new base, remove its directory/hooks only after checking the actual Trixie images, and replace (do not retain alongside) its Bookworm version/checksum assertions with the Trixie checks. Keep the Bookworm backport/release available as the immediate mitigation and rollback target.

## Coverage gaps and engineer gate

**No successful complete candidate image was available to boot.** Login, migrations, seeded chart/dashboard queries, project sync, scheduler/background workers, exports and full application E2E were not run against Debian 13. Running the runner's host-built development stack would not validate this OS change and was not used as substitute evidence.

**No vulnerability scanner was available/run** (`trivy` and `grype` were absent). There is no baseline/candidate scanner delta, SBOM, language-dependency scan, or assertion that Debian 13 is vulnerability-free. The CVE-specific tracker/package/behavior checks above are not a general scan. Final runtime APT/pip/npm inventories and native shared-library checks are also outstanding.

An engineer must review the dependency/support choice, versions, backport reconciliation and these findings, then attach passing E2E evidence against **the actual production Debian 13 image and preview**. Agent probes do not satisfy this gate. Failures and untested areas need explicit follow-up. Do not auto-merge, deploy, or mark the migration complete.

### Concrete validation plan

1. On an isolated builder with at least 30 GiB **free** disk, apply the prototype, select the Python support approach, pin/record fresh base digests and resolve all nine production environments plus preview. Build both full targets without push or Sentry credentials. Capture cold and warm wall time, cache status, full build logs, final digest/size and package inventories. Compare a Bookworm build of the same application revision; keep any required Bookworm backport in that control build.
2. On each final image, run `check-perl.sh`, every installed `/usr/local/dbt1.x/bin/dbt --version`, `pip check`, adapter imports and native-library loads. Preserve per-environment freezes. Compile representative real projects for **each supported adapter/version combination**, then exercise actual warehouse connections, TLS, sync and queries. Test the preview subset separately; a production pass is not a preview pass.
3. Boot the actual images with disposable seeded Postgres, object storage and the separately managed headless browser. Test migrations and `/api/v1/health`, login as the seeded demo user, project creation/compilation/sync, chart and dashboard queries (including DuckDB), and preview deployment hooks. Record image IDs in the evidence, not just a source SHA.
4. Run `pnpm -F e2e cypress:run` with the E2E configuration targeting those image-backed endpoints (not the host dev server). Include scheduler/worker execution, scheduled deliveries, CSV exports, PNG/PDF/screenshot exports, CJK/font rendering and object-storage upload/download. Check worker/API/browser logs and failed job queues. Exercise optional jemalloc if it is used in the target deployment.
5. Produce comparable SBOMs and scans using the same current scanner/database (e.g. `trivy image --format json --output scan.json IMAGE`). Compare OS **and** npm/Python findings, and explicitly resolve CVE-2026-48962 for both Perl sources. Treat missing scanner databases, unfixed findings and unsupported architectures as gaps rather than clean scans.
6. Review the findings and attach passing production + preview E2E evidence before approving any rollout. If ARM64 is a promised distribution target, repeat builds and all native/dbt checks there; otherwise state the amd64-only coverage explicitly.

### Remaining effort estimate

Allow **2–4 engineer-days** after a support decision: roughly 0.5–1.5 days for the Python/adapter approach and reproducible builds, 0.5 day for full inventory/scanner/build comparisons, and 1–2 days for credentialed adapter checks, application/worker/export E2E, review and rollout planning. A dbt deprecation/customer migration or a newly owned Python distribution can exceed this estimate. More disk alone only unblocks the preview build; it does not fix production's Python compatibility failures.

### Rollback

This investigation changes no live image selection, so rollback now means not applying `prototype.patch`. For a later approved rollout, retain immutable known-good Bookworm production **and preview** image digests (with the reviewed Perl mitigation), configuration and database backup; canary the Trixie images first. On compile/query/worker/export regression, revert both image references, drain/retry affected jobs safely and verify health/login/queries again. This OS-only prototype introduces no database migration, but the real release must still be checked for unrelated schema changes before assuming image-only rollback is safe. Do not restore an unpatched Bookworm image merely to roll back the OS.

## Reproduction

From a clean checkout of this investigation (do not run these against shared production services):

```sh
# Preserve the baseline before applying the blocked prototype.
git apply --check docker/debian13-investigation/prototype.patch
# Optional full build attempt: apply, run the complete build commands above,
# then reverse the patch to restore the unchanged deployment files.
git apply docker/debian13-investigation/prototype.patch
# ... complete builds ...
git apply --reverse docker/debian13-investigation/prototype.patch

# No runtime containers/database are needed for these isolated build probes.
python3 docker/debian13-investigation/probe.py generate
for distro in bookworm trixie; do
  for version in 1.4 1.5 1.6 1.7 1.8 1.9 1.10 1.11 1.12 preview; do
    timeout 420 docker buildx build --platform linux/amd64 \
      --file ".migration-evidence/$distro-$version.Dockerfile" \
      --progress plain \
      --output "type=local,dest=.migration-evidence/$distro-$version" . \
      > ".migration-evidence/$distro-$version-build.log" 2>&1
  done
done
```

The generator also produces the full-demo preview probes, the limited Python 3.11 alternative probes, and the positive/negative Perl checks:

```sh
for probe in bookworm-demo-preview trixie-demo-preview \
  trixie-python311-1.4 trixie-python311-1.8 \
  perl perl-optional perl-tamper perl-shadow; do
  timeout 420 docker buildx build --platform linux/amd64 \
    --file ".migration-evidence/$probe.Dockerfile" --progress plain \
    --output "type=local,dest=.migration-evidence/$probe" . \
    > ".migration-evidence/$probe-build.log" 2>&1
done
```

Run sequentially to limit disk use. The probe's successful build/export means **results were collected**, not that checks passed: inspect every `results.json` exit code and its associated logs. Each command is bounded; install timeout is 240 seconds. The generated contexts use moving tags/APT/PyPI; substitute the saved digests for an exact base comparison and retain newly resolved inventories. Never pass warehouse or Sentry credentials into these logs. Ignore/remove local `.migration-evidence/` outputs before committing.
