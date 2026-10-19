# How fast a revocation takes effect

This page says what happens, and how soon, when access for agents is taken
away: a grant is revoked, a person loses a role or is deactivated, or an
admin narrows **Permissions** on the org **Agents** page. It is the contract
behind [agent-permissions.md](./agent-permissions.md), which says what agents
may do. Terms follow [CONTEXT.md](./CONTEXT.md).

Two words that this page uses:

- A **grant** is the consent that a person gave to one OAuth client: an
  `agent_connection_grants` row, with the access tokens and the refresh token
  family that are bound to it. The code calls it `AgentConnectionGrant`.
- A **plain OAuth token** is an OAuth token that is bound to no grant.

An agent connection limits requests that use its credential. Programs the CLI
starts still run as the person's computer user and can read saved credentials;
see [Scoped CLI credentials](../../packages/cli/README.md#scoped-cli-credentials).

Agent permission checks resolve `agent-identity` for the organisation.
Connections require it for both the person and organisation. Queued work with a
person marker and work with a connection execution record have different flag
checks, described in section 3. The two caches, the `/oauth/revoke` route and
the clean-up of the agent sign-in on deactivation do not depend on the flag;
strict handling of unbound refresh families does, as the revoke table explains.

## The rule

Access for agents is read from the database when a request or a job step
checks it. The access token is an opaque credential that refers to stored OAuth
scopes and grant data. Approval, policy and roles are checked from the database,
not from a role snapshot embedded in the token.

So the promise has one shape everywhere: **a change takes effect at the next
check that reads the database after the change is committed.** This is a
statement about the next check, not about elapsed time:

- A request that has already passed its checks can finish.
- Two in-memory caches of the signed-in person exist when
  `EXPERIMENTAL_CACHE=true` (see [Caches](#caches)).
- Work that is already running is checked at fixed points, not continuously
  (see [Queued and scheduled work](#3-queued-and-scheduled-work)).

## Summary

| Change | Takes effect | Delay |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A grant is revoked | Next request with its access token; next refresh; next check of queued work for it | No cache. The next check reads the database. |
| A person's role, project access or place in **Who can use agents** changes; a capability is removed; agents are turned off | Next agent permission check | No cache for the agent permission check. With the cache on, the person's ordinary role on a plain OAuth token, a personal access token or a browser session can be up to one cache entry old (30 seconds after its lookup finished). |
| A person is deactivated | Next request | No cache for a grant-bound token and for queued work. With the cache on, a plain OAuth token, a personal access token or a browser session can be up to one cache entry old. |
| Queued or scheduled agent work | At the start of the job and at the points in the table in section 3 | A step that has passed its check can finish. |
| A person is deactivated: the stored agent sign-in | Deleted in the same transaction as the deactivation | None |
| A person is removed: the stored agent sign-in | Deleted by the foreign-key cascade when the user row is deleted | None |
| **Permissions** are widened | A grant never gets a capability or a project that the person did not approve | Not applicable |

## 1. Revoking a grant

Revoking a grant (`AgentConnectionGrantModel.revoke`) is one transaction:

- the grant row is kept and marked revoked;
- its authorization codes are deleted;
- every refresh token of the grant and of its refresh family is marked
  revoked;
- the access token rows that are bound to the grant are kept, so that a
  request with a revoked token is recognised and refused, and cannot fall
  back to a browser session;
- access tokens of the same family that are bound to no grant are deleted.

After that:

- A request with the access token is refused with `401 invalid_token`.
  `OAuth2Model.getAccessToken` reads the token and the grant on every
  request.
- A refresh is refused with `invalid_grant`.
- Queued work for the grant is refused at its next check
  (`AgentConnectionGrantService.assertActiveExecution`).

There is no cache of OAuth tokens or of grants on this path, on any pod.

A grant is also refused for other reasons than a revoke: it has expired, its
contract version is no longer supported, the token or the queued work does
not match the grant that it names, or the flag is turned off. A grant-bound
token that is refused does not become a plain OAuth token.

Ways to revoke:

| Way | Effect |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The owner API, `DELETE /api/v2/user/agent-connections/{grantUuid}` | Revokes the grant |
| `POST /api/v1/oauth/revoke` with the grant's live **refresh** token | Revokes the grant |
| A second use of a refresh token of the grant that was already used or revoked | Revokes the grant |
| `POST /api/v1/oauth/revoke` with the grant's **access** token | Expires that access token only. The grant and its refresh token keep working. |
| `POST /api/v1/oauth/revoke` with a refresh token that is bound to no grant | Deletes every unbound access and refresh token of its family, when the token has a family and strict refresh handling applies to it (the flag is on). Otherwise deletes that refresh token only. |

### The personal settings screen

**My agent identity** calls the owner API. Its **Agent connections** tab lists
connections, approved projects and actions, expiry, last use and state. Expanding
an active connection with valid limits shows its restrictions from a status
response. The screen keeps that response and does not read it again when the row
is reopened. The allowed actions shown are an overview, not a promise that a
request succeeds: a request can still be refused by private-space access, a
protected branch, a second required action, or scheduled pre-aggregate refreshes
in the project. The person can revoke that connection from the tab. **Warehouse sign-ins** has a separate
tab. With no connections and no list error, the page shows warehouse sign-ins alone.

| Screen action | Owner endpoint |
| --- | --- |
| List | `GET /api/v2/user/agent-connections` |
| Read status | `GET /api/v2/user/agent-connections/{grantUuid}/status` |
| Revoke | `DELETE /api/v2/user/agent-connections/{grantUuid}` |

### CLI revocation and recovery

`agent revoke --name <slot>` calls the owner DELETE endpoint with the saved
connection's existing access token. It does not refresh that token or fall back
to the personal API key. An expired connection or an expired or rejected access
token needs recovery with `agent revoke --name <slot> --human`.

`--human` uses a matching personal CLI login. It rejects a global connection
selection and a service account credential. It checks the instance and calls
`GET /api/v1/user` to verify the connection's person and organisation before
sending DELETE. An admin's login cannot revoke another person's connection.

Before sending DELETE, the CLI marks the local attempt unconfirmed. It validates
the matching revoked state returned by the server, then removes the saved slot
only if its grant and token generation have not changed. An unconfirmed revoke
keeps the local credential. A confirmed server revoke can still exit 1 if local
cleanup fails or the slot changed. Confirmation and local removal together exit 0.

Connection API requests keep the instance path prefix, stay inside
`<instance>/api/` and refuse redirects, including during personal recovery;
see [Instance URLs and proxies for agent connections](../../packages/cli/README.md#instance-urls-and-proxies-for-agent-connections).

### Limits

- Revoking on the server does not remove the person's personal API key, files on
  their computer, or warehouse credentials already issued. A confirmed CLI revoke
  removes only this connection's unchanged saved slot and its refresh journal.
- Revoking does not stop a program the CLI has already started. The CLI checks
  the connection before it starts the program, not while the program runs. That
  program keeps the access it has as the person's computer user.
- Expiring an access token on its own does not refuse queued work that was
  already started with it. The job checks the grant, not the access token. Revoke
  the grant for the next job check to refuse it.
- An admin cannot revoke another person's grant. There is no endpoint.
- `/oauth/revoke` answers `200` also when the database call fails. A `200`
  alone does not prove that the token is gone.
- A grant-bound access token that is revoked on its own gets a fixed expiry
  of 1970-01-01 00:00:00, or keeps its expiry if it is earlier. The next
  authentication check refuses it. It does not wait for the API clock to
  catch up with the database clock. This holds when the API clock is later
  than 1970-01-01 00:00:00 in the API process's time zone. The row, grant and
  refresh token are kept.
- Deactivating a person does not revoke the person's grants. They are
  refused while the person is inactive. If the person is reactivated before
  a grant expires, that grant can work again. A deleted warehouse agent sign-in
  is not restored and may need sign-in again.

## 2. Narrower permissions

An agent permission check has two steps:

- `AgentPermissionService.loadRequest` reads the flag and the organisation's
  **Permissions**: the mode, the capabilities for each role, the organization
  capability list, and allowed groups. It returns a frozen handle.
- `assertOperationWithRequest` evaluates one operation with that handle. With
  "Limit what agents can do" on, it reads the person's current role
  assignments. It reads the person's group membership once
  for each handle.

These reads do not use the caches below. A handle belongs to one request. It
keeps the **Permissions** that it loaded, so it does not see a later change
to them. It keeps the result of its first group lookup, so it does not see a
group change after that lookup. The next request sees both. Role assignments
are read again at each evaluation. MCP owns its own settings; the permission
check does not read them.

What the next check sees:

| Change | Result |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A role, or a custom role's capability scope, is removed from the person | The capability is gone, unless another role or custom role of the person still gives it. Roles add up. |
| A capability is removed from a role on the **Agents** page | The same. The table of capabilities for each role is not an upper limit on what a custom role gives. |
| A capability is unticked in the organization list                       | Refused for every role, including custom roles                                                         |
| The person is removed from an allowed group | Refused, when the person is in no other allowed group |
| Every capability is unticked with limits on                             | Refused, including agent turns                                                                         |

The capability and "every capability unticked" rows apply with
"Limit what agents can do" on. Group admission applies in both modes. A
person's active state is not part of this check: authentication and the job
checks cover it.

Who is under **Permissions**:

| Caller | Under **Permissions** | The person's ordinary role and active state come from |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| MCP with a grant-bound OAuth token | Yes, and also limited to what the person approved | The database, on every request |
| MCP with a plain OAuth token | Yes | The session cache, when it is on |
| The agent in the app (browser session) | Yes | The session cache, when it is on |
| The Slack agent | Yes | The database, in the job |
| MCP or the API with a personal access token | **No.** A narrower agent permission does not narrow a personal access token. | The personal access token cache, when it is on |
| MCP or the API with a service account token | **No**, for the same reason | The database |

## 3. Queued and scheduled work

The person-marker jobs in the table below check the person when they start and
at fixed points before they deliver or publish. A check loads the person again for
the exact organisation and refuses an inactive person; most jobs also check
**Permissions** (see below). When a check refuses, the points after it do
not happen. What the job has already published stays.

The Slack answer job, Autopilot and the summary step of a scheduled delivery
read the flag themselves when they run. Every other job in the table checks
only when its payload carries a marker, which the code that queues it adds
when the flag is on; a job with no marker runs as before. A job that was
marked while the flag was on still checks the person after the flag is
turned off.

A check that reads "when 30 seconds have passed" runs only at the next point
that asks for it. There is no timer: a step that takes long is not
interrupted.

| Work | Checked at | When refused |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Slack agent: the answer | The start. While the answer streams, at an update when 30 seconds have passed since the last check. Before each final message and the SQL approval card. | The stream is closed and the remaining messages are not posted. The thread gets the refusal message. |
| Slack agent: chart images and outcome messages | Before each upload and each message | The remaining uploads and messages are not posted |
| Scheduled delivery with an AI summary | Before the summary is generated. At the start of each send. | The delivery goes out without the summary |
| Autopilot | Before the first model call. At each tool call: a tool that changes content loads the person and refuses an inactive person at once, and every tool runs the full check when 30 seconds have passed. Before the report is written; then before the run is recorded and before each Slack message when 30 seconds have passed. | The tool loop is cancelled and nothing more is posted. The run is recorded as failed with "Run blocked". |
| dbt writeback from the agent tool | The start. Before the remote branch, the remote commit or push, and the pull request. Before the review event, the Slack reaction, the preview and its comment, the result in the thread and the Slack message. | The later points do not happen. The card in the thread shows an error. The run shows an error unless it had already finished. |
| dbt writeback from the MCP tool | The start. Before the remote branch, the remote commit or push, and the pull request. | The later points do not happen. The run shows an error. |
| Review remediation (writeback, preview and compile polls, verification run) | Writeback and verification run: the start. A poll: only when it is about to publish. Before each point that publishes. | The remediation is marked failed |

What each check covers:

- All of them: the person is active and in the organisation. Service-account
  principals are exempt from the active check.
- Slack, the scheduled delivery summary and Autopilot also check
  **Permissions** for an agent turn: **Who can use agents**, and with "Limit
  what agents can do" on also whether the saved capability list is empty. They do
  not check each capability again at these points; the tool calls inside a
  turn check their own capabilities.
- dbt writeback also checks the dbt writeback capability. From the MCP tool
  with a personal access token or a service account it checks the person
  only.
- Review remediation checks the person only. The requests that start it
  ("Create PR" and "Retest") are not under **Permissions**; the agent turns
  that it starts are.

These checks carry the person, not a grant. The separate connection checks below
use a connection execution record.

A refusal for an inactive person writes an audit record. In the review
remediation jobs, a person who is no longer in the organisation and a
malformed marker are recorded on the remediation, with no audit record.

### Connection jobs

`SchedulerTask.runConnectionTask` checks compile, validation, custom-field
replacement and pre-aggregate materialization jobs at entry. It reloads the
grant, the person, stored approval and current **Permissions**. It checks the
execution binding and token scopes. A connection job refuses a disabled flag,
even if it was queued while the flag was on. Later effect checks run before
publishing, validation writes, custom-field writes and materialization effects.
Validation, custom-field replacement and compile-triggered materialization jobs
inherit the connection execution record. Catalog indexing does not.

On an entry refusal, the task body does not run. With successful failure
bookkeeping, the refusal is logged and the job is consumed; a compile's older
job record is marked in error. Failure bookkeeping can itself fail, as described
under [Queue evidence and limits](#queue-evidence-and-limits).

### Compile credential checks

A connection's compile has four credential checks, using the `compileProject`
effect:

| Check | What it comes before |
| --- | --- |
| Start of compile credential setup | Resolving the project's credentials, which can refresh and store a warehouse token |
| After setup | Acquiring the primary warehouse client, including SSH tunnel credentials |
| Before each extra warehouse connection | Loading its credentials, which can refresh and store a token |
| After each extra credential load | Acquiring that connection's client |

The checks run when those steps are reached. A preview that copies explores from
its upstream project does no credential setup and reaches none of these four.
A refusal at an extra connection check fails the whole job; it is not turned
into a warning for that connection.

Limits:

- **A refresh already started can finish.** There is one check at the start of
  each credential resolution, not inside it. If the connection is revoked while
  a token refresh is in flight, the refresh can finish and store the rotated
  warehouse token. The job is refused at its next check, acquires no client for
  that connection, and does not reach publishing. Source tests cover a Snowflake
  refresh on the primary and an extra connection with a stubbed token exchange.
- **Not bounded by time, only by the step.** A job revoked mid-run keeps going
  until its next check: the next credential setup, client acquisition or existing
  check. A stretch between two checks can include acquiring a client, fetching
  the dbt manifest, reading the warehouse catalogue and compiling. After the last
  extra connection it also includes the remaining package, config and context
  reads and working through the primary connection's explores before the existing
  check at the start of publishing. No longest duration can be stated; it depends
  on the project and the warehouse.
- **Reading stored settings is not checked.** A running connection job can still
  load the project record, which decrypts the stored credentials in memory and
  drops them. Nothing is exchanged, written or connected by that read.
- **A client already open stays in use.** Inside an open client the job builds
  further client objects from the credentials that client already holds.
  Building them makes no exchange, token write or acquisition.
- **An open client keeps authenticating itself.** A warehouse client that is
  already open keeps authenticating itself to its provider while the job uses it.
  That happens inside the warehouse client, outside these connection checks.
  These refreshes store no token in the application database. A refusal at the
  job's next check stops further work, and a refusal at or before the start of
  publishing prevents publishing.
- **Publishing is checked before the write, not during it.** A revocation that
  commits after the check at the start of publishing does not undo the write,
  so a job can end in error with its explores saved and indexing queued. The same
  holds for the catalogue cache and for project tags, parameters and table
  groups: each is its own write and is not rolled back by a later refusal.
- **Any failure of a check fails the job.** If the check itself fails, for example
  on a database error, the job fails. It does not carry on.
- **Queries started by a pre-aggregate materialization are separate.** They use
  the query path, which has its own checks and gaps on retry. These compile
  credential checks do not cover them.

### Scheduled pre-aggregate refreshes

A connection cannot add a pre-aggregate with a scheduled refresh, or deploy to,
refresh or change parameters of a project that has one. The check also runs
inside the write transaction, after the project's `cached_explores` row lock,
on the same database connection.

| Write | Checked under the lock |
| --- | --- |
| Array explore save | Stored state and the exact array being saved, before deletion |
| Stream and multi-connection explore saves | Stored state and staged rows, including kept rows, before promotion |
| Virtual view create and update | Stored state and the view being written |
| Parameter replacement | Stored state, before parameter deletion |

A refusal rolls back that write transaction. This is a check for scheduled
refreshes; it does not put grant revocation and all publication in one transaction.
Connections do not create cron jobs. Compile-triggered materialization jobs are
separate from cron schedules.

Limits:

- The registry of pre-aggregate definitions is still synced after the save
  commits. A connection's sync pass can write registry rows for a schedule a
  person saved a moment later. Creating scheduled jobs for it is suppressed
  for connections.
- Project and organisation delete and the rescue script remove state without
  taking this lock; they cannot add a schedule. Preview content copy does not
  take the lock either: it copies virtual views and external source explores as
  stored. Those are built without schedules, so in normal use it adds none;
  a stored row of that kind that already carried a schedule would be copied with it.
- Jobs already queued for a schedule that was later removed are not cancelled
  by this check.
- During a rolling update, a pod without the in-transaction check still checks
  outside the lock. No connection credential can be issued yet.
- A deploy session batch that arrives after finalize has read the batches
  answers success and is not published. This applies to ordinary deploys too.
- A refusal inside the transaction undoes that write only. In a compile,
  parameters and project settings written earlier in the same job are separate
  commits and stay. In a session finalize the session is marked failed, where
  a refusal by the earlier check leaves it uploading.
- A connection's parameter write takes the `cached_explores` row, then parameter
  rows. Project and organisation delete remove parameter rows by cascade; the
  order of rows inside a cascade cannot be shown by reading source. The overlap
  test covers an ordinary parameter replacement and a connection's write, with
  both completing.

### Queue evidence and limits

The real-queue source tests use a migrated database, the scheduler client, the
queue runner and production task bodies and checks. Git fetch and dbt use fixture
manifests; analytics is replaced. This is evidence of current behaviour, not of
credential issuance or a live warehouse token exchange.

The following cases are marked as likely defects, awaiting a decision:

- **A compile refused after it has published.** New explores and a new search
  catalog for them (the catalog job queued before the refusal still runs), with
  old or absent compile manifests; the job is in error. Catalog indexing is not
  bound to the connection and makes no connection check, even after revocation.
- **A finalize refused after it has published.** A published project with
  indexing queued, a session marked failed, and no validation job; the service
  caller gets an error with status 403. Finalize is driven at the service in this
  evidence, not over HTTP.
- **Catalog indexing that fails part-way.** A partly restored catalog (what was
  written before the failure stays, the rest is missing) and a used-up job the
  queue will not run again. A forced replay restores it in the covered cases.
- **A failure while recording a failure, or a replay.** A failed status write
  hides the first error and leaves the job's bookkeeping half written; a replay
  publishes the explores again and queues the index and validation jobs a second
  time. A compile is logged as completed before its validation and replacement
  jobs are queued: if queuing them then fails, the log says completed and then
  error, while the older job record says done. A failed scheduler error-log
  insert can leave an exhausted queue row. A failed write to the older compile
  job record can leave it started with a skipped step.

**What the repair of the manifests was and was not shown for.** Shown in the
multi-connection cases: after the refused compile, a successful ordinary full
compile of the project rewrites all three manifest stores, starting both from
older manifests and from none. Not shown: repair when one warehouse connection
fails during that compile, repair by a deploy that uploads explores without
compiling, or recovery of catalog display data that was lost.

These jobs are given one attempt and are not retried. "Forced replay" means the
test made the job runnable again. The evidence does not cover a worker killed
mid-job, a real NATS broker, or a materialization refused after its query finishes.

### Not covered yet

- Agent turns over HTTP: the turn is admitted at its start and each tool call is
  checked, but nothing checks the person again while a long turn runs or before
  the runtime stores its answer.
- Review automation and its exports.
- Long-running agent pipelines (data apps, deep research, onboarding), and the
  compile job that a person-marker writeback preview queues. The connection
  compile checks above do not establish coverage for that person-marker path.
- Agent memory jobs and the background jobs that generate artifacts (the delivery
  of chart images to Slack is covered).
- Queries and exports that an agent starts, where they are not already checked
  against a grant.

Known behaviour that is not changed:

- With Slack identity enforcement off and no requirement to link an account,
  a Slack prompt runs as the person who installed the Slack app.
- An ordinary link unfurl in Slack renders as the person who installed the
  Slack app.

## 4. Credentials for the warehouse

| Credential | Removed when |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The person's agent sign-in (Snowflake) | The person is deactivated through `UserModel.updateUser`, in the same transaction, with the flag on or off. The person is removed (the row goes with the user). A new sign-in for an inactive person is refused. |
| Shared agent account | The project or its warehouse connection is deleted, or an admin removes it. It belongs to the project, not to a person. |
| The organisation's Snowflake agent client | The organisation is deleted. An admin can replace it; there is no way to remove it. |
| A person's own credential for an external MCP server | The person is removed. Not on deactivation. |

Not promised:

- Work that already holds a warehouse client can finish.
- Nothing here calls the warehouse to revoke a token that it has already
  issued. How long such a token stays valid is up to the warehouse.
- Revoking a grant removes no warehouse credential.

A person can prepare a CLI approval request with a session or personal access
token at `POST /api/v2/user/agent-connections/requests` when `agent-identity`
is enabled for the person and organisation. This stores only a pending request.
The opaque authorize URL hands the browser to `/agent/connection-approval`;
this preparation flow creates no grant, authorization code or token.

The same person can review the request in a browser session at
`GET /api/v2/user/agent-connections/requests/{requestUuid}`. The response says
"Review only. No connection will be created." A decision at
`POST /api/v2/user/agent-connections/requests/{requestUuid}/decision` records
approval or denial once. Approval records only the reviewed selection.
It creates no grant, authorization code or token.

`GET /api/v2/user/agent-connections/requests/{requestUuid}/completion` returns
the same browser session to the stored loopback URI once. Approval returns
`error=agent_connections_unavailable`; denial returns `error=access_denied`.
Both include the original state and instance issuer. Neither includes a code.
A reviewed request cannot later become a grant. A new connection needs a new
request and review.

Expired approval requests are cleaned up every hour at minute 53 on workers
enabled for that cleanup task. It deletes requests expired at least one hour ago
in batches of up to 1,000, at most 50 batches per run, and skips locked rows.
It allows three attempts and two hours of backfill. Creating a pending request
also purges up to 100 expired rows. This deletes approval requests, not grants
or tokens; expiry already prevents review or completion before deletion.

## 5. Wider permissions

A grant stores what the person approved: capabilities, projects and resource
limits. An operation through a grant must pass each of these, separately:
the stored approval (`evaluateGrant`), the OAuth scopes of the token, the
current **Permissions**, and the person's ordinary authorisation. Saving
wider **Permissions** changes the policy rows and no grant.

So a wider policy can give back something that the person approved and that
was narrowed in between. It cannot give a grant a capability or a project
that the person did not approve. That needs a new grant. A new grant does
not revoke an older one. The model's explicit `replace` operation does revoke
the old grant in the same transaction that creates its replacement.

## Caches

Two in-memory caches hold the signed-in person, with the person's ordinary
role and active state. Both exist only when `EXPERIMENTAL_CACHE=true`. With
the variable unset these two caches do not exist.

| Cache | Holds | Used by | Lifetime |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------- | ----------------------- |
| `sessionUserCache` (`UserModel`) | The person for a browser session or a plain OAuth token | Session and plain OAuth requests | 30 seconds for an entry |
| `PatSessionCache` | The person and the token's own data for a personal access token | Personal access token requests | 30 seconds for an entry |

Each API process has its own copy. Nothing tells the other processes to drop
an entry. Deactivating or deleting a person through `UserModel` removes that
person's session entries and all personal access token entries in the
process that runs it; rotating or deleting a personal access token clears
the token cache of that process. A role change clears nothing.

The 30 seconds count from when the lookup that filled the entry finished. A
lookup that is in flight when a change is committed can read the old state
and then keep it for a full lifetime.

These two caches are not used by grant-bound tokens, by the agent permission
check (`loadRequest` and `assertOperationWithRequest`), or by the checks in
queued and scheduled work.

### Measured

These are historical numbers for main, from one local set-up, measured on
2026-10-11. They are not a timing guarantee for any deployment.

Set-up: two API processes from one build, one Postgres database,
`EXPERIMENTAL_CACHE=true` on both, the scheduler off. Four probes, polled
every 0.25 seconds: a browser session and a personal access token, on each
process. Before each trial the entries were left to expire, one request per
probe filled them, and the change was made straight after.

| Change | How it was made | Trials | Time until the last of the four probes saw it |
| -------------------------------------- | ------------------------------------------- | ------ | --------------------------------------------- |
| The person is deactivated | Written to the database directly | 5 | 30.1 to 30.3 seconds |
| The person's organisation role changes | Through the API of one of the two processes | 5 | 30.1 to 30.2 seconds |

Over all 40 samples the shortest time was 29.8 seconds and the longest was
30.25 seconds.

What to take from this:

- A role change is not cleared on any process, also not on the process that
  handled the change. Every process showed the old role for the lifetime of
  its entry.
- The deactivation was written directly to the database, so no process
  cleared its own entries, and no agent sign-in was deleted: that clean-up
  is part of `UserModel.updateUser`. A deactivation through
  `UserModel.updateUser` clears the entries of the process that runs it; the
  other processes still wait for their entries to expire.
- With the cache off, the same requests read the person from the database at
  each request.

## Tests that pin this

Real Postgres, through the real models and services
(`packages/backend/src/database/migrations/__tests__/`, run by the "Schema
compatibility" job):

| File | Pins |
|---|---|
| `agent_revocation_contract.migration.integration.ts` | A revoked grant refuses its access token, its refresh and the check that queued work uses, and a second grant of the same person keeps working. A revoked refresh token ends the grant; a revoked access token does not. A removed project role, capability, organization capability list or group membership is seen by the next permission check, and a handle that was loaded before keeps its **Permissions**. A wider policy does not widen a stored grant. Deactivation deletes the agent sign-in, or rolls back when the delete fails. Removal deletes the person's grants, tokens and own credentials and keeps a shared credential for an external MCP server. |
| `oauth_access_revocation_clock.migration.integration.ts` | A grant's access token that is revoked on its own is refused at once while the API clock is fixed at 2000 and the database clock is later. The row stays bound, the grant and refresh token stay usable, and a second connection works. A repeated revoke changes nothing, an earlier expiry is kept, and the stored expiry is the same when the database session uses another time zone. |
| `oauth_refresh_rotation.migration.integration.ts` | With strict refresh handling, revoking a refresh token that is bound to no grant deletes its whole family; a refresh that is in flight cannot bring it back. |
| `agent_connection_grants.migration.integration.ts` | The rows that a grant revoke changes and keeps. |
| `agent_sign_in_deactivation.migration.integration.ts` | Deactivation and a new agent sign-in cannot both win, in either order. |
| `agent_connection_two_processes.migration.integration.ts` | Next-request connection refusal in two independent processes and ordinary-session cache expiry. |
| `agent_compile_credential_gate.migration.integration.ts` | Credential and client checks; an in-flight stubbed refresh can store a rotated token before the next check refuses. |
| `pre_aggregate_refresh_transaction.migration.integration.ts`, `pre_aggregate_refresh_finalize_race.migration.integration.ts` | Checks under the write lock, overlapping ordinary writes and late finalize batches. |
| `agent_queue_entry.migration.integration.ts`, `agent_queue_publication.migration.integration.ts` | Entry refusal, partial publication, manifest repair, catalog indexing, one-attempt jobs and failed bookkeeping. |

Unit tests, next to the code that they test:
`agentWorkAuthority.test.ts` pins the 30-second rule with a controlled clock
and the rule that the first failure is kept. `slackAccessRefusals.test.ts`,
`SchedulerTask.test.ts`, `ManagedAgentService.test.ts`,
`runEditDbtProjectPipeline.test.ts`, `AiWritebackService.test.ts` and
`AiAgentAdminService.test.ts` pin what each job does when a check refuses at
each of its points.

Separate two-process source tests assert next-request connection refusal on
both processes after role, project, group or policy access is removed, the person
is deactivated or deleted, or the connection is revoked or expired. They query
the second process first and include still-warm ordinary session caches. They
also cover ordinary-session cache expiry with a five-second tolerance and no
response-time upper bound.

The historical four-probe timing measurement above is not automated. These
separate tests do not rerun it or prove real credential issuance. Warehouse-issued
token behaviour is outside these tests.

## Where it is in code

| What | Where |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Grant revoke | `AgentConnectionGrantModel.revoke`, `AgentConnectionService.revoke` |
| Token lookup, refresh and `/oauth/revoke` | `OAuth2Model.getAccessToken`, `getRefreshToken`, `deleteAccessToken`, `revokeUnboundRefreshFamily`; `OAuthService.revokeToken` |
| Agent permission check | `AgentPermissionService.loadRequest`, `assertOperationWithRequest` |
| Stored approval of a grant | `auth/agentConnectionGrants/evaluateGrant.ts`, `AgentConnectionGrantService.assertActiveExecution` |
| Checks in queued work: the marker and the guard | `services/AgentPermissionService/agentWorkAuthority.ts` |
| Slack agent jobs | `ee/services/AiAgentService/AiAgentService.ts` |
| Scheduled delivery with an AI summary | `scheduler/SchedulerTask.ts` (`checkSummaryBeforeSend`), `ee/services/SchedulerAiAugmentationService` |
| Autopilot | `ee/services/ManagedAgentService/autopilotAuthority.ts` |
| dbt writeback | `ee/services/AiWritebackService/writebackAgentWork.ts` |
| Review remediation | `ee/services/reviewRemediationAgentWork.ts` |
| Agent sign-in clean-up | `UserModel.updateUser`, `UserWarehouseCredentialsModel.upsertAiSnowflakeCredential` |
| Caches | `sessionUserCache` in `models/UserModel.ts`, `models/caches/PatSessionCache.ts` |

Paths in the table above are under `packages/backend/src/`.

Additional locations:

- Screen and owner API calls: `packages/frontend/src/features/agentConnections/`
  and `packages/frontend/src/components/UserSettings/MyAgentConnectionsPanel/`.
- CLI revoke and personal recovery: `packages/cli/src/handlers/agentRevoke.ts`
  and `packages/cli/src/agentConnections/personalRecovery.ts`.
- Compile credential checks: `packages/backend/src/services/ProjectService/ProjectService.ts`
  and `packages/backend/src/services/MultiConnectionCompiler/MultiConnectionCompiler.ts`.
- Write-transaction refresh checks: `packages/backend/src/services/ProjectService/preAggregateRefresh.ts`,
  `packages/backend/src/models/ProjectModel/ProjectModel.ts` and
  `packages/backend/src/models/ProjectParametersModel.ts`.
- Approval cleanup: `packages/backend/src/scheduler/SchedulerWorker.ts` and
  `packages/backend/src/models/AgentConnectionApprovalRequestModel.ts`.
