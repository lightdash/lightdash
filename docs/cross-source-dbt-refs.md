# Cross-source dbt refs

Cross-source refs work between dbt sources on the same warehouse connection. Each source must use a unique `name:` in `dbt_project.yml` within that connection.

The deadline settings apply when the `cross-source-dbt-refs` organisation flag is on. The source fetch concurrency setting also controls fetches with the flag off:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DBT_SOURCE_FETCH_CONCURRENCY` | Derived from available CPUs and memory | The maximum number of sources prepared or fetched at once. |
| `DBT_SOURCE_PREPARE_TIMEOUT_MS` | `180000` | The time allowed for each source to clone its repository and install dbt packages. |
| `DBT_SOURCE_LS_TIMEOUT_MS` | `300000` | The time allowed for each `dbt ls` attempt. |
| `DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS` | `1200000` | The time allowed for the full cross-source resolution. |

Timeout values are in milliseconds. A source deadline starts when its operation starts, after it gets a concurrency slot. A deadline cancels running dbt processes and fails the compile. Raise the relevant deadline if a project needs longer.
