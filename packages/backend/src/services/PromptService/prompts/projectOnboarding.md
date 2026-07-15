# Complete Lightdash project setup

Treat each numbered section as a gate. Satisfy its **Gate** before continuing.

## Prepared setup

Use the warehouse type, prepared project UUID, and PAT from the original prompt. If any value is missing, ask the user for it and wait before continuing.

## 1. Install the CLI and skills

1. Run `command -v lightdash && lightdash --version`.
2. Keep the installed CLI when its semantic version is `<Server-compatible CLI version>` or newer.
3. Otherwise, try Homebrew with `brew tap lightdash/lightdash && (brew upgrade lightdash || brew install lightdash)`.
4. If Homebrew is unavailable, fails, or leaves an older version, install the exact compatible version with `npm install -g @lightdash/cli@<Server-compatible CLI version>`.
5. If the shell still resolves an older CLI, remove that conflicting installation and repeat the exact npm installation.
6. Run `lightdash install-skills`.

**Gate:** `lightdash --version` reports `<Server-compatible CLI version>` or newer, and `lightdash install-skills` succeeds.

## 2. Authenticate and bind the prepared project

1. Run `lightdash login <Lightdash instance URL> --token <PAT>`.
2. Run `lightdash config set-project --uuid <Prepared project UUID>`.
3. Run `lightdash config get-project`.

**Gate:** The selected UUID exactly matches the prepared project UUID. If it differs, ask the user for the correct prepared UUID and remain at this gate.

## 3. Choose and apply the project name

Inspect repository documentation and project metadata, then use the first supported name:

1. An explicitly documented business or analytics purpose.
2. The dbt or repository analytics project name.
3. `<Warehouse type> Analytics`.
4. `Lightdash Analytics`.

Run `lightdash config rename-project --name "<chosen name>"`, then run `lightdash config get-project`.

**Gate:** The selected UUID is the prepared project UUID and its name is the chosen name.

## 4. Discover, author, and deploy the semantic layer

1. Inspect the repository and working tree. Preserve unrelated files and uncommitted work.
2. Run `lightdash warehouse-catalog --json`, followed by narrower catalog queries where useful.
3. Select one coherent analytics use case supported by repository and warehouse evidence. Use that evidence as the sole source of business context.
4. Use Lightdash as the sole warehouse access path.
5. Use `developing-in-lightdash` for semantic-layer authoring. Prepare the existing dbt project when it is usable; otherwise, build a pure Lightdash semantic layer from the warehouse catalog.
6. Keep edits scoped to the selected use case and preserve unrelated semantic content.
7. Deploy to the prepared project UUID. For a dbt-backed project, run `lightdash deploy --project <Prepared project UUID>`.

**Gate:** The semantic layer compiles and deploys to the prepared project UUID without errors.

## 5. Build the starter dashboard

Create one dashboard for the selected use case in a space named `Lightdash Starter`. Before writing YAML, read the installed big-number, cartesian, table, and dashboard references; also read the pie reference when using a pie or donut chart.

### Dashboard specification

- Use deterministic `agent-starter-*` chart slugs and `agent-starter-dashboard` for the dashboard so reruns update the same content.
- Use a non-overlapping 36-column grid with a full-width markdown header that explains the use case and notes that AI generated the dashboard.
- Place 2–3 evenly sized KPI tiles in one row, with consistent business labels and appropriate currency, percentage, K, or M formatting.
- When a reliable date exists, add a wide chronological time series and a date-range filter whose default fits the observed data. Otherwise, add a useful non-time comparison.
- Add one categorical breakdown using queried warehouse values, sorted by the primary metric and limited to the top 10. Prefer a bar chart. For a pie or donut, use at most 7 segments, hidden slice labels, and a horizontal legend.
- Add readable, abbreviated data labels to at least one bar chart when they improve interpretation.
- Add one full-width detail table and choose either conditional formatting or in-cell bars.
- Add 1–2 low-cardinality categorical filters based on queried values.
- Place primary charts below the KPI row at balanced widths such as 24+12 or 18+18; use width 36 for the detail table.
- For sensitive domains, use aggregated results free of direct identifiers.

Run `lightdash lint`, execute every chart with `lightdash run-chart -p <chart-yaml-path>`, then upload with `lightdash upload --project <Prepared project UUID> --validate`. Resolve every compile, field, filter, formatting, and query failure, then repeat the failed check.

**Gate:** Lint passes, every chart executes successfully, and validated upload succeeds.

## 6. Verify and hand off

1. Run `lightdash config get-project` and confirm the prepared UUID and chosen name.
2. Run `lightdash validate --project <Prepared project UUID>` and resolve every reported semantic-layer error.
3. Create a temporary directory outside the repository.
4. Run `lightdash download --project <Prepared project UUID> --path <temporary-directory> --charts <every agent-starter chart slug> --dashboards agent-starter-dashboard`.
5. Inspect the downloaded YAML for every expected chart slug, the dashboard slug and chart references, and the `Lightdash Starter` space metadata.
6. Remove the temporary directory.
7. Return the working project and dashboard URLs with a concise completion summary. Keep the PAT, warehouse credentials, organization identity, user identity, and other secrets out of the handoff.

**Gate:** Project UUID and name match, validation reports no errors, every expected artifact downloads successfully, and both URLs work.
