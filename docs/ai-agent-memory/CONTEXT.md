# AI agent memory

Per-user, per-project knowledge the AI analyst learns from a user's own
threads and recalls on their future threads. Memory is recall, not authority:
current catalog truth and project context always outrank it.

Two internal terms have different names in customer-facing copy: **distill**
is "memory extraction" and **consolidation** is "dreaming". Code, docs, and
telemetry use the internal terms; UI copy uses the customer-facing ones.

## Language

**Memory**:
One durable piece of project knowledge distilled from a user's thread — a
title, a body, retrieval terms, and the catalog objects it names. Owned by
one user on one project; only that user's future threads recall it.
_Avoid_: fact, note, learning, insight

**Owner**:
The user whose thread produced a memory and whose future threads recall it.
Among eligible threads, selection, pull, ranking, and access filter on
ownership alone.
_Avoid_: author, creator

**Eligible thread**:
A thread whose origin qualifies it for memory — a human-owned web app or
Slack thread. Service-account-owned, eval, and scheduler threads are outside
memory: never distilled, never pulled into. Eligibility hangs off the
thread's owner and origin, not off whoever prompts in a given turn.
_Avoid_: human thread, real thread, memory-enabled thread

**Distill** (customer copy: **memory extraction**):
To read one sanitized thread and produce at most one memory plus a thread
summary. Outcomes are memory, no-op, skipped, or failed; no-op is the
expected outcome for most threads.
_Avoid_: extract (in code), summarize, learn

**Thread summary**:
The short account of a thread produced alongside a distilled memory, kept as
the memory's provenance.

**Consolidation** (customer copy: **dreaming**):
A curation pass over one partition's active memories that emits explicit
operations — merge, supersede, retire, promote. An empty operation list is a
valid, successful run and the expected outcome most of the time. A dry run
records proposals without applying them.
_Avoid_: cleanup, compaction, dedup, garbage collection

**Partition**:
The unit consolidation runs over: one owner's memories on one project.
_Avoid_: batch, group

**Merge**:
A consolidation operation folding near-duplicate memories into one new
memory; the sources become superseded.
_Avoid_: combine, dedupe

**Supersede**:
A consolidation operation replacing a memory with another that newer grounded
evidence supports. The loser keeps a pointer to its replacement.
_Avoid_: replace, overwrite

**Retire**:
To take a memory out of recall because it is contradicted, stale, or its
catalog objects no longer exist. Owners can retire manually, consolidation
retires at the curator's discretion, and the object sweep retires
deterministically; every path records its reason on the row. A retired
memory is the only closed status an owner can reopen.
_Avoid_: delete, archive, deactivate

**Object sweep**:
The deterministic daily pass that retires an active memory when every object
it names is unresolved. No LLM call and no partition floor, so it reaches
partitions consolidation never curates. All objects unresolved is the bar —
a partially stale memory is the curator's judgment call, and memories are
routinely born with some unresolved objects. An errored explore or an empty
catalog blocks retirement: a broken dbt compile hides objects without
removing them.
_Avoid_: cleanup, garbage collection

**Status**:
A memory's lifecycle state: active (recalled), superseded (replaced by
another memory), retired (removed from recall), or promoted (graduated to
project context).

**Scope**:
Whether a memory is a personal working preference (user) or knowledge that
would hold for any analyst on the project (project). Scope never affects
which memories are recalled; project scope means "nominate for review",
never "safe to broadcast".
_Avoid_: visibility, sharing level

**Pull**:
One injection of a memory into the agent's context for a thread. Counted per
memory as a usage signal.
_Avoid_: recall (as the counter), load, fetch

**Cite**:
The agent referencing a memory in an answer via its citation marker. Cited
count is the evidence a memory earns support for promotion; it never
justifies merge, supersede, or retire.
_Avoid_: reference, use

**Citation handle**:
The memory's slug — the only identifier the agent and the consolidation
curator ever see.
_Avoid_: id (in prompts), uuid

**Terms** (memory context):
The retrieval words stored on a memory. Outside this context, qualify as
"memory terms" — unqualified "terms" elsewhere means glossary terms.

**Objects**:
The catalog explores and fields a memory names, re-resolved against the
current catalog. An unresolved object no longer exists in the catalog.
_Avoid_: references, links

**Nomination**:
Putting a memory forward for promotion — manually by its owner or by a
consolidation promote operation once the memory has enough citations. A
nomination opens a review item on the review board.
_Avoid_: proposal, submission

**Promotion**:
A nominated memory graduating into project context, so its knowledge applies
to every analyst on the project. Completes when the review item's change is
merged; the memory's status becomes promoted.
_Avoid_: sharing, publishing, broadcasting

**Provenance**:
Where a memory came from: its source thread, or the set of source memories a
merge consolidated.
_Avoid_: history, origin (in code)
