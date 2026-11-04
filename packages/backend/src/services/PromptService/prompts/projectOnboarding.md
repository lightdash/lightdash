# Complete Lightdash project setup

Treat each numbered section as a gate. Satisfy its **Gate** before continuing, and combine compatible shell checks when that avoids repeated tool calls.

## Prepared setup

Use the warehouse type, prepared project UUID, and, when listed, the configured database and schema from the original prompt. If the warehouse type or project UUID is missing, ask the user for it and wait before continuing.

## Safety rules

- Use the `lightdash` CLI as the only authenticated interface to Lightdash and the warehouse.
- Never read or print credential-bearing files, extract saved API tokens, inspect connection payloads, or make authenticated HTTP requests directly. Commands may use credentials internally without displaying them.
- If a required CLI capability is unavailable, stop and report the blocker instead of bypassing the CLI.
- Work only in the prepared repository. Preserve unrelated files and uncommitted work.

## Progressive handoff

Maintain a durable handoff report during the run. During the initial repository inspection, choose the first unused path from this sequence and keep it for the entire run:

1. `LIGHTDASH_HANDOFF.md`
2. `LIGHTDASH_ONBOARDING_HANDOFF_<YYYY-MM-DD>.md`
3. `LIGHTDASH_ONBOARDING_HANDOFF_<YYYY-MM-DD>-2.md`, incrementing the suffix until the path is unused

Never overwrite an existing report. Create or update the chosen report only at the four milestones specified below. Mark incomplete sections as `Pending`; never present planned or unverified work as complete. Reuse evidence already gathered for the current gate and do not make extra authenticated calls solely for the report.

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

1. Inspect repository documentation, project metadata, the working tree, and the available handoff paths. Detect whether there is a usable dbt project or an existing pure Lightdash project.
2. Start discovery in the configured database and schema from the original prompt, matching names case-insensitively: `lightdash warehouse-catalog --database <database> --schema <schema> --json`. Run the broader `lightdash warehouse-catalog --json` only when that configured scope has no coherent analytics use case or when no database and schema were provided. Store large output only in a gitignored temporary location. If a broad catalog spans many databases or schemas and repository evidence does not identify where to look, ask the user which database and schema to use and wait before continuing.
3. Choose the smallest coherent analytics use case supported by repository and warehouse evidence. Do not infer business meaning from names alone.
4. Fetch fields for each shortlisted relation exactly once with `lightdash warehouse-catalog --database <database> --schema <schema> --table <table> --include-fields --json`. Do not repeat field discovery through `information_schema`, another catalog call, or a raw SQL query.
5. Use `lightdash sql "<aggregate query>" -o <temporary-output-file>` for aggregate-only profiling; the output file is required. Combine compatible grain, date range, measure, category, and join profiles into as few queries as practical. Read each output file once, extract the evidence needed for authoring, then delete it. Never output raw identifiers or row samples.
6. **Handoff milestone 1 — discovery:** Create the chosen report with the selected use case, warehouse scope, selected relations and rationale, important assumptions, and concise summaries of skipped candidates. Add `Pending` sections for the semantic layer, starter questions, validation, limitations, and next steps.
7. Follow the installed skill and read each semantic-layer reference required for the detected project type at most once. Start from its basic example. Read a full schema or run `--help` only after a concrete command or lint failure cannot be resolved from the already-read reference.
8. Extend a usable dbt project when present. Otherwise, build a minimal pure Lightdash semantic layer from the catalog evidence. A pure project must include the prepared warehouse type before its first deploy:

    ```yaml
    warehouse:
        type: <Prepared warehouse type>
    ```

9. Preserve existing semantic content and use only evidenced dimensions, metrics, joins, and filter values.
    Give every metric a `description`: one short sentence in plain business language that says what it measures, such as "Number of unique orders placed" or "Total order value, after discounts". No SQL, column names, or aggregation jargon.
10. Run `lightdash lint`, resolve errors, then deploy with `lightdash deploy --project <Prepared project UUID>`.
11. **Handoff milestone 2 — semantic layer:** Replace the pending semantic-layer section with a model-to-source mapping, grains, generated files, key dimensions, metrics, joins, assumptions, and the verified lint and deploy outcomes.

**Gate:** The semantic layer compiles and deploys to the prepared project UUID without errors.

## 3. Write starter questions

Write 3–5 questions a new user could ask about the selected use case, each answerable from the deployed semantic layer. They appear as one-click prompts on the user's homepage, so they must work the first time.

- Phrase each question the way a business user would ask it, such as "How has revenue changed month over month this year?" or "Which product categories drive the most orders?". Under 80 characters, no field names, SQL, or jargon.
- Cover different angles: one headline total, one trend over time when a reliable date exists, and one or two breakdowns by a low-cardinality category.
- Never ask about direct identifiers such as names, emails, addresses, account numbers, or IDs.

Verify each question before keeping it. Read the installed chart reference once, then for each question write a temporary chart YAML under `tmp/` that answers it with existing metrics and dimensions, run `lightdash run-chart -p <chart-yaml-path>`, and drop or rephrase any question whose chart fails or returns no rows. Never put these charts under `lightdash/` and never upload them; files under `tmp/` are not kept.

Write the verified questions to `lightdash-starter-questions.yml` at the repository root:

```yaml
questions:
    - How has revenue changed month over month this year?
    - Which product categories drive the most orders?
```

**Handoff milestone 3 — starter questions:** Replace the pending starter questions section with each question and the metrics and dimensions that answer it. Do not perform extra verification calls for the report.

**Gate:** `lightdash-starter-questions.yml` lists at least 3 questions, and each one executed successfully as a chart.

## 4. Validate and hand off

1. Run `lightdash validate --project <Prepared project UUID>` and resolve every reported semantic-layer error. Repeat validation only when it failed.
2. Do not perform a round-trip download, repeat successful chart executions, or call internal APIs for additional verification.
3. **Handoff milestone 4 — final validation:** Record project validation, complete the limitations and recommended follow-up work, add a generated-files table with repository-relative links where possible, and include next steps to merge the semantic-layer files into the user's analytics Git repository and connect the Lightdash project to it. List only roles, groups, or permissions actually observed or changed; otherwise state that none were observed or changed. Remove every `Pending` marker.

The report must describe what was discovered, why the use case was selected, what was built, and how it was verified. Make it easy to audit with concise prose and Markdown tables. Include:

- A welcome and overview with the use case and project URL.
- A warehouse discovery summary with counts by database and schema, followed by an inventory of discovered relations and whether each was selected. Explain why selected relations support the use case and summarize why the others were not modeled.
- A semantic-layer table mapping each generated model to its warehouse source, grain, generated file, key dimensions, metrics, joins, and important assumptions.
- A starter questions table listing each question with the metrics and dimensions that answer it.
- An access section listing only roles, groups, or permissions actually observed or changed during the supported workflow. If none were observed or changed, say so explicitly and do not imply that permissions were audited.
- A validation table recording semantic deploy, lint, each starter question's chart execution, and project validation outcomes.
- Known limitations, skipped candidates, access constraints, and recommended follow-up work.
- A generated-files table with repository-relative links where possible, followed by the next steps to review and merge the semantic-layer files into the user's analytics Git repository and connect the Lightdash project to that repository.

Do not include secrets, credentials, tokens, raw warehouse rows, direct identifiers, or large copied YAML blocks in the report. Base every claim on repository, catalog, aggregate-query, or CLI validation evidence. Do not perform extra authenticated calls only to populate the report.

Return a compact, secret-free handoff containing only:

- A one-sentence summary of the analytics use case delivered.
- The working project URL.
- A repository-relative link to the generated handoff report.
- A suggested next action to merge the generated semantic-layer model files into the user's analytics Git repository, then update the Lightdash project configuration to connect to that repository.

Keep detailed inventories and validation results in the report. Do not recap the gates, reproduce generated YAML in chat, or replace the repository-integration next action with unrelated follow-up work.

**Gate:** After project validation succeeds, the report exists and the user receives the compact handoff with working project and report links plus the repository-integration next action.
