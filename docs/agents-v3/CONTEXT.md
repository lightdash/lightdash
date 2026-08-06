# Agents v3 — Context

Glossary of canonical terms for agent conversation persistence. Terms only — no implementation detail.

## Terms

### Thread
A single agent conversation, scoped to an organization/project and optionally an agent. The stable identity all conversation consumers reference. Canonical term — "session" is not used except when quoting external systems (OpenCode/Pi/Codex call this a session).

### Storage version
The immutable format (v1 legacy or v3) a Thread's history is persisted in, fixed at thread creation. A thread is never hybrid: v1 threads remain readable and read-only; new feature-flagged threads are v3.

### Message (v3)
A single unit within a Thread with exactly one Role. Content lives entirely in its Parts. System prompts are derived from agent configuration at run time and are never persisted as Messages; tool activity and reasoning belong to assistant Messages as Parts.

### Role
The kind of a Message: `user`, `assistant`, or `compaction`. The first two are speakers; `compaction` marks an in-band boundary row, not an utterance. Model-level `system`/`tool` messages are synthesized by adapters.

### Part (v3)
An ordered, typed unit of Message content. The only place conversation content is persisted. Canonical types: `text`, `reasoning`, `tool`, `file`, `artifact`, `step-start`, `source`, `compaction`. The set is extensible in code without migration; each type declares model-visible vs UI-only. `viz` is not a part type — visualization output is deprecated in favor of Artifacts.

### Artifact part
A Part referencing a specific artifact version produced during an assistant Message. A Message may contain any number of Artifact parts, ordered like any other Part.

### Steer
A user utterance arriving while a run is active. Persisted as an ordinary user Message; its position in the thread order captures the mid-run timing. Not a distinct entity in v3.

### Pinned context
User-selected chart/dashboard references attached to a user Message when it is sent. Rides in Message metadata, never in Parts; rendered as reference chips. Model exposure is a server-side prompt concern.

### Context message
A user Message ingested from the surrounding Slack conversation under thread-access consent, rather than addressed to the agent. Authored by no resolved Lightdash user (`created_by_user_uuid` is null); the true Slack author is recorded in the Slack satellite. An ordinary user Message in every other respect.

### Frozen message
An assistant Message whose run has reached a terminal state. Its content (and Parts) never changes afterwards; only Annotations may be added. The sole sanctioned exception is Redaction.

### Annotation
Post-hoc data attached to a Message without changing its content — feedback, scores, visibility flags. Lives beside Messages, never inside them.

### Redaction
A privileged, audited, repository-layer overwrite of Part payloads in place — rows, identifiers, and ordering preserved, never row deletion. The sole sanctioned exception to Frozen message immutability; because Forks inherit prefixes logically, redacting a parent redacts every descendant. Not built at launch. Distinct from edit (a Fork) and from visibility Annotations.

### Provider metadata
Opaque, provider-namespaced JSON returned by a model provider and stored losslessly inside a Part's payload — including reasoning signatures and encrypted reasoning blobs. Never promoted to schema columns; replayed only to the provider that produced it.

### Run status
The mutable lifecycle of an assistant Message's run: `in_progress`, `completed`, `error`, or `canceled`. A projection beside content, kept live by heartbeat; reaching a terminal value is what freezes the Message. Never derived from timestamps at read time.

### Healing at freeze
The terminal-status transition that moves any tool Part still mid-lifecycle to its interrupted error state, so persisted history is always well-formed and read adapters never synthesize missing results.

### Tool approval
A segment of the tool Part lifecycle (`approval-requested` → `approval-responded` → execution or `output-denied`) persisted in the Part and replayable to the model. Tool-agnostic, covering MCP tools. The deciding user and time live in a satellite record, never in the frozen Part.

### Transient part
Stream-only content (keepalives, step progress) that is never persisted. Anything durable must be a first-class typed Part; no generic data part exists.

### Envelope
A versioned jsonb value on an assistant or compaction Message row recording run facts outside content: `model_config` (what actually ran), `token_usage`, and `error` (named machine code + user-facing message, present only on `error` status).

### Compaction row
An in-band Message with role `compaction`, appended at its own thread_seq when earlier history is summarized; never rewrites anything. Its `compaction` Part holds the summary (model- and UI-visible) and the exact summarizer input for audit (invisible); its Envelope records summarizer cost. Replay: the latest compaction row on the composed path wins — emit its summary as a tag-wrapped user message, then only rows after it; earlier rows stay on disk. Forks inherit it iff the fork point is at or after its seq. Triggered between turns only, client-side, best-effort: a failed summarize writes nothing.

### Lineage
The immutable, creation-time relationship linking a Thread to the Thread it descends from. Two kinds: Spawn and Fork. Threads form a tree; a Thread without lineage is a root. Each Thread stays strictly linear inside. Every Thread in a lineage tree shares the root's organization/project/agent scope, fixed at creation; the tree is deleted as a unit (cascade on the parent link), so a dangling inherited prefix is impossible. Lineage never grants read access in either direction.

### Fork
A new Thread that logically inherits a prefix of another Thread's history — nothing is copied. The only way to regenerate or branch history; Messages themselves never carry branch structure. Forks are first-class Threads; only non-Spawn Threads may be forked.

### Spawn
A Thread created by a parent run's delegate tool call to execute a sub-agent. Inherits no parent history; its first user Message is the agent-authored task prompt. Hidden from Thread lists, reachable only through its parent; shares the root Thread's scoping and lifecycle. Each execution attempt is its own Spawn.

### Anchor
The exact tool Part (Message + tool call id) in a parent Thread that a Spawn descends from. Several Spawn attempts may share one Anchor.

### Deep research run
An orchestrated multi-phase research execution (planner → parallel investigators → judge) whose lifecycle — status, budgets, cancellation, report expiry — lives on a satellite run record beside the Thread, never in Messages. On v3, the judge phase runs as the parent Thread's assistant Message; planner and investigator phases are Spawns created deterministically by the executor with their context packed into each task prompt — never by model delegation. The report stays on the run record; the frozen Message carries only a reference Part.

### Read adapter (v1)
The quarantined module that projects immutable v1 turn aggregates into the v3 wire shape — the only code that reads v1 rows. Order within a v1 turn is synthesized deterministically (chronological, uuid tiebreak); content is lossless. A view, never a write path.

### Read-only thread
A thread whose transcript is frozen for conversation mutations (send, steer, interrupt, generate) for the current viewer; annotations and thread management (feedback, rename, delete) remain allowed. All v1 threads are read-only; other causes exist (Slack-driven threads, viewing another user's thread). Clients learn this from a computed, viewer-specific `readOnly` capability plus a reason code — never by branching on Storage version.

### Turn (v1)
Legacy v1 aggregate (`ai_prompt`): one row holding both a user prompt and the assistant response under a single identity. Superseded in v3 by Messages.
