# Composer rules live on the query tool and a pointed-to skill

On the MCP server, the rules for building a `query` pipeline live in two
places: the core rules (one semanticLayer node per explore, merge versus
duckdb, one pipeline per answer, when a sql node is allowed, follow-up reuse)
on the `query` tool description within 4,096 characters, and the full rule
set in the built-in `query-pipelines` skill served by `read_skill`. The
description's first sentence and the composer server instructions' first line
point to the skill; the instructions otherwise carry only the workflow and
rules about the server. The rule text has one source, shared with the in-app
agent's prompt.

Server instructions were rejected as the home for the rules: Claude chat,
the majority of production calls, shows them only from the turn after the first tool
call, and Haiku, shown the rules there, passed the merge task 2 times in 5,
against 0 in 5 with no rules at all. The same rule on the tool description or
in a pointed-to skill passed 5 in 5. Putting every rule in the description
passed too (Opus 40 in 40, Haiku 5 in 5), as did the skill with a pointer; the
skill was chosen for the long tail because `read_skill` serves it fresh on
every read, while a changed description reaches Claude chat users only in a
new chat, after a tool-list refresh or up to 28 minutes later, and the core rules keep the description
within 4,096 characters. A skill without a pointer was rejected because
models did not read it: 1 in 6 Claude chat runs and 0 in 36 Claude Code runs
read it before the first query, against 5 in 6 and 65 in 67 with the pointer.
Appending the rules to the first discovery result passed as well (Opus 39 in
40, Haiku 5 in 5) but was rejected because it ties the rules to whichever
discovery tool a client calls first, and a session that queries without
discovering never sees them. The MCP skills extension (protocol 2026-07-28)
was rejected for now: no production client speaks it, and in Claude Code it
loads only interactively, where Haiku loaded it in 8 of 15 runs and passed
the merge task 2 times in 5. Per-client detail is in
`packages/backend/src/ee/services/McpService/client-limits.md`.

Revisit when clients deliver server instructions before the first tool call,
or when the MCP skills extension reaches production clients.
