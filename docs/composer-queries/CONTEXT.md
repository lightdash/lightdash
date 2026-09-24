# Composer queries

A pipeline of queries across sources, submitted together by the AI agent,
with DuckDB joining or transforming the results of the other queries. The
result is shown in the thread as a chart artifact with the pipeline beside it.

Sibling of merge queries: both run on the compose engine, but a composer query
is an agent-authored pipeline of any shape, while a merge is a two-query join
in the Explorer.

## Language

**Composer query**:
One submission of a pipeline by the AI agent in a single tool call. Also the
name of the tool. Each submission is one run and one artifact version.
_Avoid_: multi-source query (the API layer under it), composed query, merge

**Pipeline**:
The set of nodes in a composer query, ordered by their references. Shown to
users under the heading "Queries".
_Avoid_: DAG (in user-facing copy), graph (the visual mode, not the thing)

**Node**:
One query in a pipeline, named by a node id, with a title shown to users. Its
result is a table other nodes can read. Node ids are internal and never reach
the user interface.
_Avoid_: step (in code; "N steps" is the user-facing count only), query
(ambiguous with the composer query), source (a node kind)

**Source node**:
A node that reads data from outside the pipeline: the semantic layer,
warehouse SQL, or external data. Grouped under "Sources" in the pipeline panel.
_Avoid_: input, leaf, root

**Transformation**:
A DuckDB node that reads only other nodes' results. Runs on the compose engine
and never touches the warehouse. Grouped under "Transformations".
_Avoid_: duckdb node (in user-facing copy), join node, post-processing step

**Reused node**:
A node copied into this run's pipeline from an earlier run of the thread,
because this run read its result instead of re-running it. In the composer
artifact and the pipeline panel it is an ordinary node, indistinguishable
from the run's own. A read of a result no earlier run of this thread owns
stays a placeholder named by its alias.
_Avoid_: external reference, cached result, dependency, earlier result

**Reads**:
The references a node declares to other nodes' results. Shown to users by node
title, never by node id.
_Avoid_: depends on, inputs, references (in user-facing copy)

**Terminal node**:
The node whose result the artifact shows and the tool returns. The unique sink
by default, or chosen explicitly. Suffixed "result" in the pipeline panel.
_Avoid_: output node, final node, sink (in user-facing copy)

**Composer artifact**:
The chart artifact a successful composer query creates: the terminal node's
result table plus the pipeline that produced it. One per thread, one version
per run.
_Avoid_: composer chart, result artifact

**Pipeline panel**:
The collapsible, resizable panel at the bottom of the composer artifact that
lists the pipeline, with a List and a Graph mode.
_Avoid_: footer, pipeline card (that is the live tool-call card), drawer

**Pipeline card**:
The body of the "Ran composer queries" tool-call row, shown while the run is
in flight and when it fails. Collapses once the run's artifact exists.
_Avoid_: tool-call description, pipeline panel

## Boundaries

- Composer queries are web-chat only and gated by the multi-source query and
  compose SQL runner flags plus the agent's data access setting.
- The public query-sources API accepts the same node shapes, including node
  titles, but owns no user interface.
