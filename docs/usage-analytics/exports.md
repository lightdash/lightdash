# Export events

The `export_events` system model captures existing `download_results.started`,
`download_results.completed` and `download_results.error` analytics events.
It adds no instrumentation to export flows.

Existing coverage includes manual query downloads, scheduled CSV/XLSX/Google
Sheets exports and dashboard CSV ZIP generation. Image downloads are not
included. Format and context retain the values reported by the existing events;
the generic query download path currently labels non-XLSX downloads as CSV.

`total_events` counts lifecycle records, including retries. Filter `event_name`
to count starts, completions or failures separately. Completion describes file
or Google Sheets generation, not receipt by a user. `job_id` is available for
some flows, but there is no universal operation ID or retry deduplication.

Metadata includes org/project/actor IDs, time, format, context, and optional job,
table and row-count fields. Rows, SQL, filenames, URLs and errors are excluded.
The existing capture/access flags and org-scoped compaction apply. Existing
analytics projects need a provisioning refresh to add the model; new data
appears after closed-day compaction. There is no historical backfill.
