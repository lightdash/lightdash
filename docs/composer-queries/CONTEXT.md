# Composer queries

A pipeline of queries across sources, submitted together by the AI agent,
with DuckDB joining or transforming the results of the other queries. The
result is shown in the thread as a chart artifact with the pipeline beside it.

Sibling of merge queries: both run on the compose engine, but a composer query
is an agent-authored pipeline of any shape, while a merge is a two-query join
in the Explorer.

## Language

**Composer query**:
One submission of a pipeline by the AI agent in a single call to the
composer query tool. Each submission runs its pipeline once and registers the
nodes that succeeded as thread composer query nodes, even when another node
failed; it creates no artifact by itself.
_Avoid_: multi-source query (the API layer under it), composed query, merge

**Composer query tool**:
The agent tool that submits a composer query, named `query` both in the
in-app agent and on the MCP server. Its result gives
the node status of every node, flags nodes that reached their limit and the
nodes that read them, names the terminal node and tells the agent to visualize
it. On failure it names the nodes it saved and the nodes it did not. Calls recorded before
the rename carry `runComposerQueries` and still parse and render.
_Avoid_: runComposerQueries (the legacy name), run_composer_queries

**Visualize**:
The agent tool that presents a node, named `visualize`: a node id from the
thread composer query nodes, a title, a description and a viz config. Each
call writes one artifact version; several calls in a turn show several cards.
A lone semantic-layer node writes a classic semantic artifact version (the viz
config mapped onto runQuery's chart config), keeping underlying data, drill,
explore from here and save; a big number, an area with a secondary axis, or a
node the runQuery payload cannot carry writes a composer version like every
other node. A pie or series split
runs the node through the results cache to return readability hints.
_Avoid_: present tool, show, render

**Run**:
One execution of a pipeline, producing a node result for every node. The
submission runs it once; opening an artifact version runs its snapshot again
and never changes the version. In a run, each node executes or is served from
the results cache.
_Avoid_: re-plan, refresh (a UI action, not the thing), new version

**Pipeline**:
The set of nodes in a composer query, ordered by their references. Shown to
users under the heading "Queries".
_Avoid_: DAG (in user-facing copy), graph (the visual mode, not the thing)

**Node**:
One query in a pipeline, named by a node id, with a title shown to users. Its
result is a table other nodes can read. A node id names one definition for
the whole scope it was defined in. Node ids are internal and never reach the
user interface.
_Avoid_: step (in code; "N steps" is the user-facing count only), query
(ambiguous with the composer query), source (a node kind)

**Source node**:
A node that reads data from outside the pipeline: the semantic layer,
warehouse SQL, or external data. Grouped under "Sources" in the Lineage.
_Avoid_: input, leaf, root

**Transformation**:
A node that reads only other nodes' results and never touches the warehouse:
SQL on the compose engine, or Python in a sandbox. Grouped under
"Transformations".
_Avoid_: duckdb node, python node (in user-facing copy), join node,
post-processing step

**Thread composer query nodes**:
The nodes that succeeded in a thread's composer queries, each under its node
id, with its node columns. A failed node is never registered, so its node id
can be resubmitted corrected. A submission may read any of them by node id. The thread
is one scope; a composer session is another.
_Avoid_: registry (in user-facing copy), node store, artifact nodes

**Composer session**:
The scope of nodes an MCP client builds across composer queries, owned by
one user in one project. Started by a submission without a session id; the
server returns the id and the client passes it back to reuse nodes. Like a
thread, it never expires. An unknown, foreign or other-project id is
rejected, never replaced.
_Avoid_: MCP session (the transport's analytics token, removed from the
protocol), pipeline scope, thread

**Reused node**:
A node of the submission's thread or composer session that it reads by its node id instead
of writing it again. It is copied, with everything it reads, into the
submission's pipeline, where it is an ordinary node, indistinguishable from
the submission's own.
_Avoid_: external reference, cached result, dependency, earlier result

**Reads**:
The nodes whose results a node declares it reads, by node id: nodes of the
same submission or thread composer query nodes. Shown to users by node
title, never by node id.
_Avoid_: depends on, inputs, references (in user-facing copy)

**Unread node**:
A node of a submission that no other node of the same submission reads. A
submission has exactly one; a submission with several is rejected before it
runs.
_Avoid_: sink, end node, orphan, leaf

**Terminal node**:
The node whose result the tool returns to the agent. The submission's unread
node by default, or any node of the pipeline chosen explicitly. Labelled
"Final result" in the Lineage.
_Avoid_: output node, final node, sink

**Present**:
The agent's act of making an artifact from a node so its result is shown to
the user: a visualize call, on any node of the thread, from this turn or an
earlier one. Results the agent does not present stay exploration, visible only
in the pipeline card. Slack still presents with `<slack-table queryUuid>` in
the final answer.
_Avoid_: select (the Slack vocabulary), show, publish, render

**Presented node**:
A node the agent presented. Its result is what the composer artifact version
displays by default.
_Avoid_: selected node, displayed node (which may be any node of the panel)

**Snapshot**:
The closed pipeline stored in an artifact version: the presented node and
everything it reads, copied from the thread composer query nodes when the node
is presented, so the version reads no node outside itself. The tool result
carries no snapshot.
_Avoid_: pipeline copy, closure (in user-facing copy), frozen pipeline

**Node result**:
The result table of any one node of a run, terminal or not. Every node result
can be displayed and visualized the same way. Results are creator-scoped and
expire.
_Avoid_: intermediate result, step output, preview

**Node status**:
How one node did in a run: its state, error, row count and result columns,
read from the node's query history row and never stored on its own. A node
whose row count equals its limit reached its limit, so its result may be cut.
_Avoid_: node run, query status, limit reached flag

**Node sample**:
The first few rows of a non-terminal node's result, shown to the agent in the
composer query tool's result beside its node columns. Never shown to users.
_Avoid_: preview (the terminal node's rows), peek, head

**Node columns**:
The result column references and types of a node, stored beside its
definition in the thread composer query nodes by the run that registered it,
from its node status. They hold no query id. visualize checks a viz config against
them; a node without them is visualized unchecked. Rendering never reads them.
_Avoid_: schema, node fields, result metadata

**Displayed node**:
The node whose result is on screen in the composer artifact. The presented
node by default; picking a node in the pipeline panel displays it, and a new
version resets it to its presented node.
_Avoid_: selected node (selection is a graph-mode concept), active node,
focused node

**Viz config**:
How the presented node's result is visualized, in the agent chart vocabulary
over the node's result column references: a builtin type (table, big number,
bar, line, area, scatter, pie, funnel) with x, y, series split, stack,
horizontal, secondary axis and labels, or a custom chart type with its slug,
field mapping and options, pinned to a chart type version when stored. Stored with the artifact version and
drawn by the same chart builders as a classic runQuery chart, with fields
synthesized from the columns of the render-time run (rendering reads no
stored node columns).
A series split adds a pivot stage over the node result and needs explicit x
and y. Versions stored before it (schemaVersion
1) keep the SQL-runner vocabulary and their viz config panel. Other node
results have no viz config and start from their column types.
_Avoid_: viz plan, presentation, chart config (the saved-chart shape it is
drawn through)

**Viz switcher**:
The kind control in the viz config panel: table or a chart kind. Shown on
schemaVersion 1 versions only. On the
presented node it edits the stored viz config's kind; on other nodes the choice
is ephemeral. It starts from the viz config on the presented node, else from a
default picked from the result's column types. The floating pill is retired.
_Avoid_: chart type selector, visualization toggle, view mode

**Viz config panel**:
The collapsible "Chart" section above the pipeline panel that shows and edits
the displayed node's viz config: kind, x axis, y values with aggregation and
series split. Shown on schemaVersion 1 versions only. On the presented node every edit is written back to the artifact
version; other nodes get the viz switcher alone. Only one of it and the
pipeline panel is open at a time.
_Avoid_: chart settings, config sidebar, viz sidebar

**Composer artifact**:
The chart artifact created when the agent presents a node: the presented
node's result plus the snapshot that produces it. One per thread, one version
per presented node. A version is declarative: its snapshot, presented node
and viz config. It holds no results, and a run never changes it.
_Avoid_: composer chart, result artifact

**Lineage**:
The composer artifact view beside the chart that shows the pipeline: a graph
on top and one step per node below, with each node's row count and whether it
reached its limit.
_Avoid_: pipeline panel (the retired bottom panel), footer, drawer, pipeline
card (that is the live tool-call card)

**Pipeline card**:
The body of the "Ran query" tool-call row ("Ran composer queries" on calls
recorded before the rename), shown for every
submission: expanded while its run is in flight or has failed, collapsed once
it completes. The only record of a submission the agent did not present.
_Avoid_: tool-call description, Lineage

## Boundaries

- Composer queries run in web chat and Slack, gated by the compose SQL runner flag plus the agent's data access setting.
- On the MCP server they compute only: no artifact, no presenting. Reuse
  rides on a composer session instead of a thread.
- The public query-sources API accepts the same node shapes, including node
  titles, but owns no user interface.
