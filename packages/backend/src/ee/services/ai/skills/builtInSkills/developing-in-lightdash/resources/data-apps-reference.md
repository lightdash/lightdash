---
name: data-apps-reference
description: What a data app is, what readContent returns for one, how to answer questions about it, and when to suggest generating a new one.
---

# Data Apps Reference

A data app is an AI-generated interactive application built on the project's semantic layer. A user describes what they want, a coding agent writes a React app in an isolated sandbox, and Lightdash builds and serves it. A data app is source code, not a block model: it has no tiles, filters or chart configs you can patch. Every prompt adds a version; versions are append-only.

Data apps are identified by a project-scoped slug in URLs and by uuid internally. `findContent` and `listContent` return both.

## Reading a data app

Call `readContent` with `type: "data_app"` and the data app's slug. The result is a structured read, never source code:

| Section    | What it holds                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity` | uuid, slug, name, description, template (`dashboard`, `slideshow`, `pdf`, or null for custom), space, href, view count, creator uuid          |
| `status`   | `latestVersion` (`version`, `status`, `statusMessage`, `error`) and `latestReadyVersion` — the version viewers actually see, or null           |
| `inputs`   | What the latest ready version was generated from: attached charts (with `linkLive`), source dashboard, clarifications, design name, external connections. Null when no version is ready |
| `data`     | Statically extracted data references of the latest ready version: one `queries` entry per call site (explore, dimensions, metrics, filter fields, parameter keys, unresolved parts), `savedChartUuids` run live, `externalHosts` called, and resolution `stats`. Null when no version is ready |
| `usage`    | Dashboards embedding the data app, scheduled deliveries targeting it, and the upstream data app uuid when this is a preview copy                        |

Notes:

- `status.latestVersion.status` is one of `pending`, `sandbox`, `catalog`, `generating`, `building`, `packaging`, `ready`, or `error`. If it is not `ready`, tell the user the data app is still building or failed (`error` has the message) and describe only `latestReadyVersion`.
- `data.queries[].unresolved` lists the parts the extractor could not resolve statically (for example an explore chosen at runtime). Say so instead of guessing.
- `data.stats` counts call sites by how fully they resolved; use it to qualify how complete the picture is.
- Personal data apps (no space) are only readable by their creator. A data app you cannot read reads as not found.
- The read never includes source files, dependencies or prompts. External agents download source with the CLI.

## Answering common questions

- "What does this data app show?" — `identity.description`, `inputs.charts`, `inputs.dashboard`, and the explores and metrics in `data.queries`.
- "What does it depend on?" — group `data.queries` by `explore`; list dimensions, metrics and filter fields. Add `data.savedChartUuids` for charts it runs live.
- "Does it call anything outside Lightdash?" — `data.externalHosts` and `inputs.externalConnections`.
- "Where is it used?" — `usage.dashboards` and `usage.schedulers`.
- "Compare two data apps" — read both and contrast inputs, explores and fields, external hosts, and usage.

Link to the data app with `identity.href` so the user can open it from the thread.

## When to suggest generating a data app

Suggest a data app when the user wants something a dashboard cannot express: a narrative or slideshow, a PDF report, custom interaction, bespoke layout, or calls to an external service. Prefer charts and dashboards for standard analysis; they are editable with `editContent` and cheaper to maintain. Generating and iterating data apps from a thread is not available through these tools yet — point the user to the data apps page.
