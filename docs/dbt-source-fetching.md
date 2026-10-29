# Fetching independent dbt sources

Each dbt source compiles independently. Models can reference models within their own dbt project and its installed packages.

`DBT_SOURCE_FETCH_CONCURRENCY` sets the maximum number of source fetches at once. If unset, the limit is derived from available CPUs, memory and disk.

| Disk variable                            | Default                               | Purpose                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES`     | Free bytes from `statfs(os.tmpdir())` | Set this to the worker ephemeral-storage limit. The filesystem fallback reports node space and cannot detect a pod limit. This includes the `/tmp` partial-parse baseline cache. |
| `DBT_SOURCE_FETCH_DISK_PER_SOURCE_BYTES` | `268435456` (256 MiB)                 | Estimated space for one checkout, installed dbt packages, target and logs. This leaves headroom above small repositories and can be raised for larger ones.                      |

The disk bound subtracts a 256 MiB primary-checkout reserve and the current size in bytes of the partial-parse baseline cache, then divides by the per-source estimate. It floors at one and caps the existing CPU and memory bound. `DBT_SOURCE_FETCH_CONCURRENCY` overrides every bound. The cache size comes from a cheap walk of `/tmp/lightdash-dbt-partial-parse`; a read error counts as zero. With a 1 GiB budget and an empty cache, the default disk bound is three sources. If the filesystem query fails, the disk bound is unknown and the CPU and memory bounds still apply.

The partial-parse baseline cache remains in `/tmp/lightdash-dbt-partial-parse`. Its cap is the smaller of 2 GiB and 25% of `DBT_SOURCE_FETCH_DISK_BUDGET_BYTES` when that budget is set. The payload digest sidecar stays next to its baseline. Both files count towards the cap and are pruned together. Pruning after each saved baseline enforces this cap. A budget below the reserve still allows one source and cannot guarantee that all estimated bytes fit.

Each dbt process uses a private `tmp` directory under its client target root. Disk release and cleanup remove this directory, including downloads left by failed `dbt deps`.
