# Data apps

AI-generated interactive applications built on a project's semantic layer. A
user describes what they want; a coding agent writes a React app in an
isolated sandbox; Lightdash builds it and serves it in a sandboxed iframe.
Every query the running app makes goes through Lightdash, so permissions are
enforced by Lightdash, not the app. Content is source code, not a block
model, and every prompt adds a version.

Three different agents touch data apps. Name them precisely when more than
one is in scope: the **coding agent** writes them, the **AI agent** finds
and reads them, an **external agent** reads them through MCP or edits their
source through the CLI. Only the coding agent generates data apps.

## Language

### The app

**Data app**:
An application generated from a prompt, owned by a project, living either
in a space or as a personal app. Identified by a uuid internally and a
project-scoped slug in URLs and as-code files. "App" is fine shorthand once
"data app" is established.
_Avoid_: presentation, report, custom chart

**Personal app**:
A data app that is in no space: visible only to its creator and listed
under My apps. Moving it into a space hands access over to the space
entirely; the creator keeps no special rights.
_Avoid_: private app, draft, unshared app

**Project chart type**:
A data app that declares a viz schema and is used as a reusable chart type
in the explorer rather than opened as an app. Excluded from data app
listings. Named "data app viz" in code.
_Avoid_: custom chart (that is the Vega feature), chart-type app, viz app

**Template**:
The starter flavor a data app is generated from: Dashboard, Slide show, PDF
report, or Custom. It seeds the coding agent's first build only; it is not a
content model.
_Avoid_: presentation (say "slide show template"), layout, mode

### Versions

**Version**:
One snapshot of a data app's source in its version timeline, normally
produced by one prompt. Versions are append-only; new ones land at the head
of the timeline.
_Avoid_: revision, iteration (as a noun)

**Build**:
The in-progress generation of a version, from prompt to running app. A build
can be cancelled; a version whose build finished is **ready**, and only
ready versions can be previewed, restored, duplicated, or promoted.
_Avoid_: job, run, generation (as a noun)

**Iterate**:
To add a version to an existing data app with a new prompt. The coding
agent works from the current source, so follow-up prompts land as targeted
changes, not rewrites.
_Avoid_: edit, update, regenerate

**Restore**:
To append a copy of an earlier ready version at the head of the timeline,
instantly and without a build. The next prompt iterates from it; the
versions in between stay as history.
_Avoid_: roll back, revert, reset

**Duplicate**:
To fork any data app you can view into a new personal app of your own,
starting at version 1 from the source's latest ready version. History,
images, pending clarifications, and the sandbox are not carried over.
_Avoid_: clone, copy (as the action)

**Promote**:
To snapshot a data app's latest ready version from a preview project into
its upstream project. The first promotion creates a linked upstream app;
later ones append a version to it.
_Avoid_: publish, deploy, push, sync

### Prompting

**Prompt**:
The user's own words for a version, stored verbatim. Clarifications and
context travel separately.
_Avoid_: instruction, request, message

**Clarifications**:
Questions asked about a vague prompt before its build starts, paired with
the user's answers. A follow-up prompt is an iteration, not a clarification.
_Avoid_: follow-ups, Q&A, refinements

**Context**:
Everything a user attaches to a prompt for the coding agent: saved charts,
dashboards, images, screenshots of the running app, files, sample data, and
external connections. Kept with the version.
_Avoid_: attachments, resources (unqualified)

**Generate from**:
To create a new data app with existing charts or dashboards attached as
context. The source content is unchanged and stays independent of the app.
_Avoid_: convert, turn into (in code and docs; acceptable in chat copy),
import, migrate

**Chart reference**:
A saved chart attached as context, either **linked** — run live from the
saved chart on every load, so later edits to the chart flow through — or a
frozen copy of its query embedded in the app.
_Avoid_: attachment, chart link, live chart (say "linked chart")

**Sample data**:
The first rows of an attached chart's query, opted into per chart or
dashboard so the coding agent can judge formatting, content, and copy.
_Avoid_: sample rows, preview rows, example data

**Blueprint**:
The structure of an attached dashboard — tabs, tiles, filters, parameters —
handed to the coding agent so it can recreate the dashboard's design.
_Avoid_: dashboard export, dashboard JSON, layout

**Theme**:
An organization-level bundle of CSS, fonts, images, a skill.md, and extra
instructions that the coding agent applies when building an app. One theme
can be the organization default. Named "design" in code.
_Avoid_: design, style, skin, brand kit

**External connection**:
A third-party HTTP API registered on a project — base URL, allowed methods
and paths, auth — that a data app can call through a credential-injecting
proxy.
_Avoid_: integration, data source, proxy (unqualified)

### Running

**Sandbox**:
The isolated environment where the coding agent writes and builds an app's
source. Per app and ephemeral: a duplicate gets a fresh one on its first
prompt.
_Avoid_: container, VM, workspace, environment

**Preview**:
The running app rendered in a sandboxed iframe, in the builder or on the
standalone preview page. Refreshing it reloads the app and re-runs its
queries without a build. Not a **preview project**, which is the
development copy of a project that apps are promoted from.
_Avoid_: render, live view, iframe (in prose)

**Network inspector**:
The tabbed panel that captures every query (Queries) and every external
request (Requests) the running app makes.
_Avoid_: query inspector, devtools, network tab

**Lineage**:
Metadata the coding agent emits at build time linking each query to the
data points rendered from it. Powers Inspect data in the network inspector.
_Avoid_: provenance, data references (a different, static set)

**Data references**:
The statically extracted set of data calls a version makes — explores,
fields, filters, parameters, linked charts, external hosts — plus how much
of it resolved. Distinct from lineage.
_Avoid_: dependencies (reserved for npm packages), usage

**Data apps as code**:
Downloading a data app's source with the CLI, editing and previewing it
locally, and uploading new versions. Identity travels by slug.
_Avoid_: export/import, source download, git sync

### Agents

**Coding agent**:
The model running inside the sandbox that writes and rebuilds the app's
source. Lightdash Cloud uses Claude; self-hosted instances can also
configure Codex. The user picks its model per prompt.
_Avoid_: Claude (as the generic name), generator, sandbox agent, the agent
(where more than one agent is in scope)

**AI agent**:
Lightdash's in-app conversational agent — surfaced as Ask AI — that finds and
reads data apps on a user's behalf.
_Avoid_: AI analyst, copilot (in code and docs), assistant, the agent
(where more than one agent is in scope)

**External agent**:
Any agent outside Lightdash — Claude Code, an MCP client, a CLI script —
reading data apps through MCP or editing their source through data apps as
code. Neither path generates an app.
_Avoid_: third-party agent, client, bot
