# QA: documents

## Scope

Documents (flag `documents`) hold charts two ways:

- **Inline charts** in the document content JSON (`content.charts`), placed by
  `<document-chart id="…"/>`. An inline SQL chart is stored as
  `{ source: 'sql', chart: { sql, limit, config, chartKind } }` with the SQL
  runner config. The stored shape is unchanged. Phase 4 changed how it runs and
  draws: the server converts it to a pipeline chart and runs it through
  `submitSavedPipelineRun` (`executeAsyncDocumentSqlChartQuery`), and the page
  draws it with the classic chart stack.
- **Linked charts**, placed by `<saved-chart uuid="…"/>` or
  `<saved-sql-chart uuid="…"/>` tags, stored in `document_version_saved_charts`
  with `saved_chart_uuid` or `saved_sql_uuid`. Not migrated: SQL links still
  point at `saved_sql` rows.

## Setup

Upgraded rig with `documents` on; `manifest.documents[0]` has an inline SQL
chart (`inline_sql`), a `<saved-sql-chart>` link to `bar_sum` and a
`<saved-chart>` link to the explore chart. Screenshot it before the upgrade and
export it to PDF.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-DOCS-U01 | `verify-upgrade.mjs`, "document" checks | The inline SQL chart and the linked SQL chart both run |
| QA-DOCS-U02 | Open the document; compare with the pre-upgrade screenshot | All three charts draw with the same numbers. Inline chart styling follows the converter's known losses (QA-SQLR-U05) |
| QA-DOCS-U03 | Export the document to PDF | All three charts in the PDF, fully drawn |
| QA-DOCS-U04 | Edit the document text, save, reopen | Charts unchanged; the `<saved-sql-chart>` tag survives the save |
| QA-DOCS-U05 | Rename `bar_sum`; reopen the document | Linked chart shows the new name (see P02) |
| QA-DOCS-U06 | Delete `bar_sum` from its chart page | The delete dialog warns that the document links it (see P03) |
| QA-DOCS-U07 | Documents as code: download the seeded document, upload it unchanged | Round-trips without errors; inline SQL chart and tags preserved |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-DOCS-N01 | Insert a chart picker link to a SQL runner chart saved after the upgrade | Linked as a chart (`<saved-chart>`), draws |
| QA-DOCS-N02 | Insert a composer chart | Linked and draws |
| QA-DOCS-N03 | Copy a chart into the document as an inline chart from an explore chart and from a pipeline chart | Explore: works. Pipeline: record what happens (inline charts know semantic, merge and SQL sources only) |
| QA-DOCS-N04 | API: create a document whose markdown has `<saved-sql-chart uuid="…">` for a chart created after the upgrade | Accepted and linked (see P01) |
| QA-DOCS-N05 | AI agent (EE) writes a document with charts | Charts render |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-DOCS-C01 | Previous release tab with the document open, refresh the inline SQL chart | Old tab asks the new server for the inline chart's results and gets the saved chart result shape; record whether it draws until reload |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-DOCS-P01 | `<saved-sql-chart>` links to charts created after the upgrade are rejected ("doesn't match a chart in this project"): the lookup reads `saved_sql` only, and the insert selects from `saved_sql` **Confirmed on the rig (2026-10-18):** returns 400 "doesn't match a chart in this project". | `DocumentModel.ts` `findSavedChartsForLinks`, `insertSavedChartLinks` |
| QA-DOCS-P02 | Existing `<saved-sql-chart>` links read the chart's name, space and deleted state from the stale `saved_sql` row | `DocumentModel.ts` |
| QA-DOCS-P03 | The chart delete dialog looks for documents linking the chart as `chart` only, so documents that link it as `sqlChart` are not listed | `DocumentModel.ts` (kind `'chart'` query used by `ChartDeleteModal`) |

## Evidence

Screenshots and PDFs before and after; for P01 the API request and response.
