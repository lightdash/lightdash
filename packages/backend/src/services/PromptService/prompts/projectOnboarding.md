# Complete Lightdash project setup

Treat each numbered section as a gate. Satisfy its **Gate** before continuing, and combine compatible shell checks when that avoids repeated tool calls.

## Prepared setup

Use the warehouse type, prepared project UUID, and, when listed, the configured database and schema from the original prompt. If the warehouse type or project UUID is missing, ask the user for it and wait before continuing.

## Safety rules

- Use the `lightdash` CLI as the only authenticated interface to Lightdash and the warehouse.
- Never read or print credential-bearing files, extract saved API tokens, inspect connection payloads, or make authenticated HTTP requests directly. Commands may use credentials internally without displaying them.
- If a required CLI capability is unavailable, stop and report the blocker instead of bypassing the CLI.
- Work only in the prepared repository. Preserve unrelated files and uncommitted work.

## 1. Bootstrap, authenticate, and bind the project

1. Run `command -v lightdash && lightdash --version`.
2. Keep the installed CLI when its semantic version is `<Server-compatible CLI version>` or newer.
3. Otherwise, when npm is available, install the exact compatible version with `npm install -g @lightdash/cli@<Server-compatible CLI version>`. Use Homebrew only when npm is unavailable: `brew tap lightdash/lightdash && (brew upgrade lightdash || brew install lightdash)`.
4. Run `hash -r` and confirm the installed version.
5. Identify the current coding agent as `claude`, `cursor`, or `codex`, then run `lightdash install-skills --agent <current-agent>`.
6. Read `developing-in-lightdash/SKILL.md` directly from the installation path printed by the installer. A skill installed during this session might not be registered as an invokable tool until the next session.
7. Run `lightdash login <Lightdash instance URL> --project <Prepared project UUID>` and complete OAuth authentication.
8. Run `lightdash config get-project`.

Do not rename the prepared project. Keep its existing name for compatibility with older supported CLI versions.

**Gate:** The CLI is `<Server-compatible CLI version>` or newer, the skill file has been read, and the selected UUID exactly matches the prepared project UUID. If the UUID differs, ask the user for the correct UUID and remain at this gate.

## 2. Discover, author, and deploy the semantic layer

1. Inspect repository documentation, project metadata, and the working tree. Detect whether there is a usable dbt project or an existing pure Lightdash project.
2. Start discovery in the configured database and schema from the original prompt, matching names case-insensitively: `lightdash warehouse-catalog --database <database> --schema <schema> --json`. Run the broader `lightdash warehouse-catalog --json` only when that configured scope has no coherent analytics use case or when no database and schema were provided. Store large output only in a gitignored temporary location. If a broad catalog spans many databases or schemas and repository evidence does not identify where to look, ask the user which database and schema to use and wait before continuing.
3. Choose the smallest coherent analytics use case supported by repository and warehouse evidence. Do not infer business meaning from names alone.
4. Fetch fields for each shortlisted relation exactly once with `lightdash warehouse-catalog --database <database> --schema <schema> --table <table> --include-fields --json`. Do not repeat field discovery through `information_schema`, another catalog call, or a raw SQL query.
5. Use `lightdash sql "<aggregate query>" -o <temporary-output-file>` for aggregate-only profiling; the output file is required. Combine compatible grain, date range, measure, category, and join profiles into as few queries as practical. Read each output file once, extract the evidence needed for authoring, then delete it. Never output raw identifiers or row samples.
6. Follow the installed skill and read each semantic-layer reference required for the detected project type at most once. Start from its basic example. Read a full schema or run `--help` only after a concrete command or lint failure cannot be resolved from the already-read reference.
7. Extend a usable dbt project when present. Otherwise, build a minimal pure Lightdash semantic layer from the catalog evidence. A pure project must include the prepared warehouse type before its first deploy:

    ```yaml
    warehouse:
        type: <Prepared warehouse type>
    ```

8. Preserve existing semantic content and use only evidenced dimensions, metrics, joins, and filter values.
9. Run `lightdash lint`, resolve errors, then deploy with `lightdash deploy --project <Prepared project UUID>`.

**Gate:** The semantic layer compiles and deploys to the prepared project UUID without errors.

## 3. Build the starter dashboard

Create one dashboard for the selected use case with dashboard slug `agent-starter-dashboard` and space slug `lightdash-starter`. Accept the display name generated from that slug; do not rename the space through another interface.

Before authoring, decide the complete dashboard structure and files. Read the installed big-number, cartesian, table, and dashboard references exactly once; also read the pie reference exactly once only when using a pie or donut chart. Start from their basic examples. Read a full schema or run `--help` only after a concrete lint, upload, or chart-execution failure cannot be resolved from the already-read reference.

Every chart must include these common fields before the first lint:

- `contentType: chart`
- `dashboardSlug: agent-starter-dashboard`
- `spaceSlug: lightdash-starter`
- `metricQuery.tableCalculations: []`
- top-level `tableName`
- `version: 1`

Use deterministic `agent-starter-*` chart slugs so reruns update the same content. Author all chart and dashboard files as one batch after deciding the structure. Run one lint across the completed batch, fix only the files and fields it reports, and repeat only failed checks.

### Dashboard specification

- Use a non-overlapping 36-column grid with a full-width markdown header that explains the use case and notes that AI generated the dashboard.
- Place 2–3 evenly sized KPI tiles in one row, with consistent business labels and appropriate currency, percentage, K, or M formatting.
- When a reliable date exists, add a wide chronological time series and a date-range filter whose default fits the observed data. Otherwise, add a useful non-time comparison.
- Add one categorical breakdown using queried warehouse values, sorted by the primary metric and limited to the top 10. Prefer a bar chart. For a pie or donut, use at most 7 segments, hidden slice labels, and a horizontal legend.
- Add readable, abbreviated data labels to at least one bar chart when they improve interpretation.
- Add one full-width aggregated detail table with either conditional formatting or in-cell bars.
- Add 1–2 low-cardinality categorical filters based on queried values.
- Place primary charts below the KPI row at balanced widths such as 24+12 or 18+18; use width 36 for the detail table.
- Never expose direct identifiers such as names, emails, addresses, account numbers, or IDs. Keep all starter content aggregated regardless of domain.

After the batch is authored, run `lightdash lint` once, execute every chart with `lightdash run-chart -p <chart-yaml-path>`, and upload with `lightdash upload --project <Prepared project UUID> --validate`. Resolve every compile, field, filter, formatting, and query failure by changing only the reported files, then repeat only the failed check.

**Gate:** Lint passes, every chart executes successfully, and validated upload succeeds.

## 4. Validate and hand off

1. Run `lightdash validate --project <Prepared project UUID>` and resolve every reported semantic-layer error. Repeat validation only when it failed.
2. Do not perform a round-trip download, repeat successful chart executions or uploads, or call internal APIs for additional verification.
3. Create `LIGHTDASH_HANDOFF.md` in the repository root as the durable, secret-free audit report for this setup. If that file already exists, preserve it and create `LIGHTDASH_ONBOARDING_HANDOFF_<YYYY-MM-DD>.md` using the current date. If that path also exists, append `-2` before `.md`, incrementing the suffix until the path is unused. Never overwrite an existing handoff file.

The report must describe what was discovered, why the use case was selected, what was built, and how it was verified. Make it easy to audit with concise prose and Markdown tables. Include:

- A welcome and overview with the use case, project URL, dashboard URL, dashboard slug, and space slug.
- A warehouse discovery summary with counts by database and schema, followed by an inventory of discovered relations and whether each was selected. Explain why selected relations support the use case and summarize why the others were not modeled.
- A semantic-layer table mapping each generated model to its warehouse source, grain, generated file, key dimensions, metrics, joins, and important assumptions.
- A content table listing every generated chart with its title, slug, type, source model, purpose, dashboard slug, and space slug.
- An access section listing only roles, groups, or permissions actually observed or changed during the supported workflow. If none were observed or changed, say so explicitly and do not imply that permissions were audited.
- A validation table recording semantic deploy, lint, each chart execution, validated upload, and project validation outcomes.
- Known limitations, skipped candidates, access constraints, and recommended follow-up work.
- A generated-files table with repository-relative links where possible, followed by the next steps to review and merge the semantic-layer files into the user's analytics Git repository and connect the Lightdash project to that repository.

Do not include secrets, credentials, tokens, raw warehouse rows, direct identifiers, or large copied YAML blocks in the report. Base every claim on repository, catalog, aggregate-query, or CLI validation evidence. Do not perform extra authenticated calls only to populate the report.

Return a compact, secret-free handoff containing only:

- A one-sentence summary of the analytics use case delivered.
- The working project URL.
- The working dashboard URL: `<Lightdash instance URL>/projects/<Prepared project UUID>/dashboards/agent-starter-dashboard/view`.
- A repository-relative link to the generated handoff report.
- A suggested next action to merge the generated semantic-layer model files into the user's analytics Git repository, then update the Lightdash project configuration to connect to that repository.

Keep detailed inventories and validation results in the report. Do not recap the gates, reproduce generated YAML in chat, or replace the repository-integration next action with unrelated follow-up work.

**Gate:** After project validation succeeds, the report exists and the user receives the compact handoff with working project, dashboard, and report links plus the repository-integration next action.
