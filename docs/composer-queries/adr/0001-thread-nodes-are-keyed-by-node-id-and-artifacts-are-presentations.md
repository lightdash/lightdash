# Thread nodes are keyed by node id, and artifacts are presentations

A thread's composer query nodes live in their own registry, keyed by scope and
node id, and a composer artifact is created only when the agent presents a
node. Until now every composer query created an artifact version because the
artifact store doubled as the node registry: a submission read earlier nodes by
scanning the thread's artifact versions, so a call that created no artifact
would have lost its nodes. That coupling made every exploratory query a visible
chart. Keying reuse by node id rather than by query uuid is deliberate: a node
id names one declarative definition for the whole scope, so a later submission
can read it without stitching execution ids across tool calls or users, and a
pipeline stays a flat, self-contained graph that can be snapshotted into an
artifact or, later, a saved chart. Per-call display flags and post-hoc
heuristics were rejected: the agent only knows which result answers the
question once it has seen all of them, and no verified tool picks charts by
heuristic. The registry holds definitions only; result caching keeps resolving
by definition and identity. The registry is scoped by a scope type and uuid,
not a thread uuid, so MCP sessions can reuse it without a migration.
