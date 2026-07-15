# Complete Lightdash project setup

Use the prepared setup values from the original prompt. If they are unavailable, ask the user for the warehouse type, prepared project UUID, and PAT before continuing.

## Stage 1 — Install Lightdash tooling and skills

- First check whether the `lightdash` command is already available with `command -v lightdash && lightdash --version`.
- Use the existing CLI if its semantic version is `<Server-compatible CLI version>` or newer.
- If the CLI is missing or older than `<Server-compatible CLI version>`, try Homebrew first with `brew tap lightdash/lightdash && (brew upgrade lightdash || brew install lightdash)`.
- To install the exact minimum compatible version, or if Homebrew is unavailable, fails, or installs an older version, run `npm install -g @lightdash/cli@<Server-compatible CLI version>`.
- Run `lightdash --version` again and do not continue if it is older than `<Server-compatible CLI version>`.
- If it is still older, remove the conflicting Lightdash CLI installation and repeat the exact npm install.
- Run `lightdash install-skills`.

## Stage 2 — Authenticate and select the prepared project

- Authenticate with `lightdash login <Lightdash instance URL> --token <PAT>`.
- Select exactly `lightdash config set-project --uuid <Prepared project UUID>`.
- Run `lightdash config get-project` and verify that the selected UUID matches the Prepared project UUID before continuing.
- If the UUID does not match, stop. Do not choose another project.

## Stage 3 — Name the project

- Choose the first defensible name using repository evidence only:
    1. A business or analytics purpose explicitly documented in the repository.
    2. The dbt or repository analytics project name.
    3. `<Warehouse type> Analytics`.
    4. `Lightdash Analytics`.
- Rename the selected project with `lightdash config rename-project --name "<name>"`.

## Stage 4 — Discover the warehouse

- Use `lightdash warehouse-catalog --json` and narrower catalog queries as needed for semantic-layer discovery. Query through Lightdash only.

## Stage 5 — Inspect the repository, prepare and deploy the semantic layer

- Inspect the current repository and working tree before changing anything. Preserve unrelated and uncommitted work.
- Use repository and warehouse evidence to identify the strongest coherent analytics use case. Do not use personal or organization identity.
- Access the warehouse through Lightdash without requesting or copying warehouse credentials.
- Use `developing-in-lightdash` only for semantic-layer authoring.
- Use the relevant `developing-in-lightdash` workflow: prepare the existing dbt project when one is usable, otherwise build a pure Lightdash semantic layer from the warehouse catalog.
- Keep changes focused on the coherent use case. Never delete or redefine unrelated content.
- Deploy only to the Prepared project UUID. For a dbt-backed deployment, use `lightdash deploy --project <Prepared project UUID>`.

## Stage 6 — Create the starter dashboard

- Build one dashboard for the strongest coherent use case in a space named `Lightdash Starter`.
- Before writing YAML, read the installed Lightdash big-number, cartesian, table, and dashboard reference documentation; read the pie reference too if using a pie or donut chart.
- Use deterministic `agent-starter-*` slugs so reruns update the intended content instead of creating duplicates.
- Use a 36-column, non-overlapping grid with a full-width markdown header that briefly explains the use case and notes that the dashboard was generated with AI.
- Include 2–3 evenly sized KPI tiles in one row. Use consistent business labels and appropriate currency, percentage, K, or M formatting.
- Include one wide time-series chart when a reliable date field exists. Sort it chronologically. If no reliable date exists, replace it with another useful non-time comparison.
- Include one categorical breakdown using warehouse-queried values, sorted by the primary metric and limited to the top 10. Prefer a bar chart; if using a pie or donut, limit it to 7 segments, hide slice labels, and use a horizontal legend.
- Use readable data labels on at least one bar chart when they add value, with abbreviated number formatting where appropriate.
- Include one useful, full-width detail table. Use either conditional formatting or in-cell bars, never both.
- Add a date-range dashboard filter when a reliable date exists, with a default supported by the observed data range. Add 1–2 useful low-cardinality categorical filters based on queried values.
- Place primary charts below the KPI row using balanced widths such as 24+12 or 18+18, and place the detail table at width 36.
- For sensitive domains, keep results aggregated and exclude direct identifiers.
- Run `lightdash lint` on the generated content.
- Execute every generated chart successfully with `lightdash run-chart -p <chart-yaml-path>` before upload.
- Upload the generated charts and dashboard with `lightdash upload --project <Prepared project UUID> --validate`.
- Fix compile, field, filter, formatting, and query failures before finishing.

## Stage 7 — Verify and hand off

- Run `lightdash config get-project` and require its UUID to equal the Prepared project UUID and its name to equal the chosen project name.
- Run `lightdash validate --project <Prepared project UUID>` and resolve every reported semantic-layer error.
- Create a temporary directory outside the repository, then run `lightdash download --project <Prepared project UUID> --path <temporary-directory> --charts <every-agent-starter-chart-slug> --dashboards <agent-starter-dashboard-slug>`.
- Treat a successful download as the server-side existence check. Inspect the downloaded YAML and require every expected deterministic chart slug, the dashboard slug, chart references, and the `Lightdash Starter` space metadata to be present.
- Remove the temporary verification directory after checking it.
- Provide the working project and dashboard URLs in the final handoff.
- Do not include the PAT, warehouse credentials, organization identity, user identity, or other secrets in the final response.
