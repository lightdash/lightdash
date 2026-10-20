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

| Disk variable                            | Default                               | Purpose                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES`     | Free bytes from `statfs(os.tmpdir())` | Set this to the worker ephemeral-storage limit. The filesystem fallback reports node space and cannot detect a pod limit. Include the `/tmp` partial-parse baseline cache (2 GiB cap) when sizing this budget. |
| `DBT_SOURCE_FETCH_DISK_PER_SOURCE_BYTES` | `268435456` (256 MiB)                 | Estimated space for one checkout, installed dbt packages, target and logs. This leaves headroom above small repositories and can be raised for larger ones.                                                    |

The disk bound subtracts a 256 MiB primary-checkout reserve and the 2 GiB partial-parse baseline cache cap, then divides by the per-source estimate. It floors at one and caps the existing CPU and memory bound. `DBT_SOURCE_FETCH_CONCURRENCY` overrides every bound. If the filesystem query fails, the disk bound is unknown and the CPU and memory bounds still apply.

The partial-parse baseline cache remains in `/tmp/lightdash-dbt-partial-parse` with a 2 GiB cap. Include it when sizing `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES`, or lower the cache cap for small workers. A budget below the reserve still allows one source and cannot guarantee that all estimated bytes fit.

Each final source releases its target and checkout after its manifest is in memory. The primary keeps its checkout and installed packages until the compile ends so project configuration remains readable, but releases its target early. With cross-source refs enabled, preparation scans stay in memory. When another source needs space, the least recently used idle checkout is evicted. Its next fetch clones and installs packages again under the preparation deadline. The pool keeps at most the chosen concurrency of additional checkouts, plus the primary. Running sources are never evicted. `diskEvictions` and `diskRecreations` start at zero in `dbt.compile.sourceFetchStart` and report cumulative counts in `dbt.compile.crossSourceRefsResolved`.
