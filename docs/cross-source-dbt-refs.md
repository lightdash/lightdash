# Cross-source dbt refs

Cross-source refs work between dbt sources on the same warehouse connection. Each source must use a unique `name:` in `dbt_project.yml` within that connection.

The deadline settings apply when the `cross-source-dbt-refs` organisation flag is on. The source fetch concurrency setting also controls fetches with the flag off:

| Variable                                 | Default                                      | Purpose                                                                            |
| ---------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DBT_SOURCE_FETCH_CONCURRENCY`           | Derived from available CPUs, memory and disk | The maximum number of sources prepared or fetched at once.                         |
| `DBT_SOURCE_PREPARE_TIMEOUT_MS`          | `180000`                                     | The time allowed for each source to clone its repository and install dbt packages. |
| `DBT_SOURCE_LS_TIMEOUT_MS`               | `300000`                                     | The time allowed for each `dbt ls` attempt.                                        |
| `DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS` | `1200000`                                    | The time allowed for the full cross-source resolution.                             |

Timeout values are in milliseconds. A source deadline starts when its operation starts, after it gets a concurrency slot. A deadline cancels running dbt processes in that connection group. Raise the relevant deadline if a project needs longer.

A deadline on the original connection fails the compile; a deadline on an extra connection group carries that group forward with a warning, like other extra-group failures.

Only confirmed projections are authoritative. The projection includes models, seeds and snapshots; only explicit public resources can be injected. A referenced provider contributes its whole public surface, with dependency links restricted to injected IDs. Duplicate providers for one model ID fail. See [the feature flag policy](feature-flags.md#cross-source-dbt-refs-and-last-good-manifests).

Each source parses once. An unseeded upstream emits a named warning and compiles before its consumers to supply a fresh seed in memory. Existing confirmed snapshots always win. A cold cycle that cannot bootstrap fails without placeholders or retries. Missing-ref parsing decorates errors only. `DBT_CROSS_SOURCE_MAX_PASSES` is retired and has no effect.

| Disk variable                            | Default                               | Purpose                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES`     | Free bytes from `statfs(os.tmpdir())` | Set this to the worker ephemeral-storage limit. The filesystem fallback reports node space and cannot detect a pod limit. This includes the `/tmp` partial-parse baseline cache. |
| `DBT_SOURCE_FETCH_DISK_PER_SOURCE_BYTES` | `268435456` (256 MiB)                 | Estimated space for one checkout, installed dbt packages, target and logs. This leaves headroom above small repositories and can be raised for larger ones.                      |

The disk bound subtracts a 256 MiB primary-checkout reserve and the current size in bytes of the partial-parse baseline cache, then divides by the per-source estimate. It floors at one and caps the existing CPU and memory bound. `DBT_SOURCE_FETCH_CONCURRENCY` overrides every bound. The cache size comes from a cheap walk of `/tmp/lightdash-dbt-partial-parse`; a read error counts as zero. With a 1 GiB budget and an empty cache, the default disk bound is three sources. If the filesystem query fails, the disk bound is unknown and the CPU and memory bounds still apply.

The partial-parse baseline cache remains in `/tmp/lightdash-dbt-partial-parse`. Its cap is the smaller of 2 GiB and 25% of `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES` when that budget is set. The payload digest sidecar stays next to its baseline. Both files count towards the cap and are pruned together. Pruning after each saved baseline enforces this cap. A budget below the reserve still allows one source and cannot guarantee that all estimated bytes fit.

Each source releases its target and checkout after its single parse is in memory. A parsed source is not fetched again. The primary keeps its checkout and installed packages until the compile ends so project configuration remains readable, but releases its target early. With cross-source refs enabled, preparation scans stay in memory. When another source needs space, the least recently used idle checkout is evicted. Its next fetch clones and installs packages again under the preparation deadline. The pool keeps at most the chosen concurrency of additional checkouts, plus the primary. Running sources are never evicted. `diskEvictions` and `diskRecreations` start at zero in `dbt.compile.sourceFetchStart` and report cumulative counts in `dbt.compile.crossSourceRefsResolved`.

Each dbt process uses a private `tmp` directory under its client target root. Disk release and cleanup remove this directory, including downloads left by failed `dbt deps`, with either flag setting. On cancellation, foreground cleanup waits at most 10 seconds. Cleanup continues when outstanding adapter creation and preparation settle, so it never removes a live checkout. Recreated sources are scanned again; a changed project name or declared upstream list fails the compile and asks for another dbt refresh.
