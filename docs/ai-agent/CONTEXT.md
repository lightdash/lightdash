# AI agent

Lightdash's in-app conversational agent, surfaced as Ask AI. A user asks
questions in a thread; the agent answers with tools that read and query the
project. Users can attach project content to a prompt so the agent knows what
they are looking at. Not the coding agent that writes data apps, and not an
external agent reaching Lightdash through MCP.

## Language

**Ask AI**:
The entry point that opens the AI agent from a piece of content — a chart,
dashboard, dashboard tile, data app, or listing row — with that content
already pinned to the new prompt.
_Avoid_: ask agent, open copilot, AI button

**Pinned context**:
The set of content a user attaches to one AI agent prompt: charts,
dashboards, data apps, previous conversations, dbt files, repositories,
external sources. Stored with the prompt and shown to the agent as names and
slugs; the agent reads the content itself with its tools. Outside this
context, qualify as "AI agent pinned context"; it is not data-app **Context**,
which is what the coding agent receives.
_Avoid_: context (unqualified), attachments, references, mentions (for the
set)

**Mention**:
Attaching content to a prompt by typing `@` and picking it from search, the
current page, or the tiles of a pinned dashboard. A mention is one way to
add pinned context; Ask AI is the other.
_Avoid_: tag, link, reference

**Runtime overrides**:
The live state a chart or dashboard had when it was pinned — dashboard
filters, parameter values, date zoom, active tab — recorded so the agent
queries what the user saw rather than the saved state.
_Avoid_: filters (unqualified), page state, snapshot

**Launcher**:
The docked panel that hosts the AI agent on content pages. Ask AI opens it;
a thread can expand from it to the full page and collapse back.
_Avoid_: sidebar, widget, chat panel

**Preview panel**:
The in-thread panel that renders a data app the agent built or the user
pinned, so it can be inspected without leaving the thread.
_Avoid_: iframe, side panel, viewer
