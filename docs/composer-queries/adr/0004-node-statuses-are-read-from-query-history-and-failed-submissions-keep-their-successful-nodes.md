# Node statuses are read from query history, and failed submissions keep their successful nodes

Every node of a run executes as its own async query, so its query history row
already holds its state, error, row count and result columns. The composer
runner reads every node's row once, after the terminal node settles, and
returns these node statuses whether the run succeeded or failed. The query
tool result, the Lineage view and the registration of thread composer query
nodes all read this one contract. Until now the runner returned only the
terminal node, so a node cut at its limit fed incomplete rows downstream
without any signal, and a failed submission registered nothing, so the agent's
next call could not read nodes that had already run.

Whether a node reached its limit is derived, never stored: one rule in common
compares the node status's row count with the node's limit (the default limit
when the node has none). A row count equal to the limit is ambiguous, because
the population may hold exactly that many rows, so every surface says the
result "may be cut" rather than "was cut". A submission that fails registers
every node that succeeded, with its node columns. A node that reads a failed
node fails too, so the successful nodes never read an unregistered node, and
the failed node's id stays free to resubmit corrected.

## Considered Options

- **Store row counts and limits in the thread composer query nodes.** Rejected:
  the registry holds definitions and node columns that outlive results, while a
  node status belongs to one run, differs on every run and expires with its
  results.
- **Store a "limit reached" flag.** Rejected: it is a second copy of a fact
  derived from the row count and the limit.
- **Fetch limit + 1 rows to tell a cut result from an exact one.** Rejected
  for now: it touches every source kind and the results cache, and "may be cut"
  is the wording the classic query tool already uses.
- **Clamp limits over the max.** Rejected: the composer query tool rejects
  them, so the requested and the effective limit are always equal.
