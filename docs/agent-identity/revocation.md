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

The agent permission checks need the `agent-identity` feature flag. The
checks in queued work start when the flag is on. The two caches, the
`/oauth/revoke` route and the clean-up of the agent sign-in on deactivation
do not depend on it.

## The rule

Access for agents is read from the database when a request or a job step
checks it. It is not copied into the token. A token holds its OAuth scopes
and the identifier of its grant, and nothing else that this page is about.

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
|---|---|---|
| A grant is revoked | Next request with its access token; next refresh; next check of queued work for it | No cache. The next check reads the database. |
| A person's role, project access or place in **Who can use agents** changes; a capability is removed; agents are turned off | Next agent permission check | No cache for the agent permission check. With the cache on, the person's ordinary role on a plain OAuth token, a personal access token or a browser session can be up to one cache entry old (30 seconds after its lookup finished). |
| A person is deactivated | Next request | No cache for a grant-bound token and for queued work. With the cache on, a plain OAuth token, a personal access token or a browser session can be up to one cache entry old. |
| Queued or scheduled agent work | At the start of the job and at the points in the table in section 3 | A step that has passed its check can finish. |
| A person is deactivated or removed: the stored agent sign-in | Deleted in the same transaction as the deactivation | None |
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
|---|---|
| The owner API, `DELETE /api/v2/user/agent-connections/{grantUuid}` | Revokes the grant |
| `POST /api/v1/oauth/revoke` with the grant's live **refresh** token | Revokes the grant |
| A second use of a refresh token of the grant that was already used or revoked | Revokes the grant |
| `POST /api/v1/oauth/revoke` with the grant's **access** token | Expires that access token only. The grant and its refresh token keep working. |
| `POST /api/v1/oauth/revoke` with a refresh token that is bound to no grant | Deletes every unbound access and refresh token of its family, when the token has a family and strict refresh handling applies to it (the flag is on). Otherwise deletes that refresh token only. |

Limits to know:

- No screen calls the owner API. **My agent identity** shows the warehouse
  sign-in, not grants.
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
  a grant expires, that grant works again.

## 2. Narrower permissions

An agent permission check has two steps:

- `AgentPermissionService.loadRequest` reads the flag and the organisation's
  **Permissions**: the mode, the capabilities for each role, the allowed
  projects, and **Who can use agents**. It returns a handle.
- `assertOperationWithRequest` evaluates one operation with that handle. With
  "Limit what agents can do" on, it reads the person's current role
  assignments. It reads the organisation's agent settings (agents on, content
  writes on) at each evaluation. It reads the person's group membership once
  for each handle.

These reads do not use the caches below. A handle belongs to one request. It
keeps the **Permissions** that it loaded, so it does not see a later change
to them. It keeps the result of its first group lookup, so it does not see a
group change after that lookup. The next request sees both. Role assignments
and agent settings are read again at each evaluation.

What the next check sees:

| Change | Result |
|---|---|
| A role, or a custom role's capability scope, is removed from the person | The capability is gone, unless another role or custom role of the person still gives it. Roles add up. |
| A capability is removed from a role on the **Agents** page | The same. The table of capabilities for each role is not an upper limit on what a custom role gives. |
| A project is removed from the allowed projects | Refused for that project |
| The person is removed from "Only these people" | Refused |
| The person is removed from an allowed group | Refused, when the person is in no other allowed group |
| Agents are turned off for the organisation | Refused |

The capability, project, people and "agents turned off" rows apply with
"Limit what agents can do" on. Group admission applies in both modes. A
person's active state is not part of this check: authentication and the job
checks cover it.

Who is under **Permissions**:

| Caller | Under **Permissions** | The person's ordinary role and active state come from |
|---|---|---|
| MCP with a grant-bound OAuth token | Yes, and also limited to what the person approved | The database, on every request |
| MCP with a plain OAuth token | Yes | The session cache, when it is on |
| The agent in the app (browser session) | Yes | The session cache, when it is on |
| The Slack agent | Yes | The database, in the job |
| MCP or the API with a personal access token | **No.** A narrower agent permission does not narrow a personal access token. | The personal access token cache, when it is on |
| MCP or the API with a service account token | **No**, for the same reason | The database |

## 3. Queued and scheduled work

A job that does agent work checks the person when it starts and at fixed
points before it delivers or publishes. A check loads the person again for
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
|---|---|---|
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
  what agents can do" on also the allowed projects and agents on. They do
  not check each capability again at these points; the tool calls inside a
  turn check their own capabilities.
- dbt writeback also checks the dbt writeback capability. From the MCP tool
  with a personal access token or a service account it checks the person
  only.
- Review remediation checks the person only. The requests that start it
  ("Create PR" and "Retest") are not under **Permissions**; the agent turns
  that it starts are.

These checks carry the person, not a grant. Work that was queued through a
grant-bound token is also checked against the grant
(`SchedulerTask.runConnectionTask`), and that is where a revoked grant is
seen.

A refusal for an inactive person writes an audit record. In the review
remediation jobs, a person who is no longer in the organisation and a
malformed marker are recorded on the remediation, with no audit record.

Not covered yet:

| Work | Ticket |
|---|---|
| Agent turns over HTTP: the turn is admitted at its start and each tool call is checked, but nothing checks the person again while a long turn runs or before the runtime stores its answer | SPK-2752 |
| Review automation and its exports | SPK-2753 |
| Long-running agent pipelines (data apps, deep research, onboarding), and the compile job that a writeback preview queues | SPK-2754 |
| Agent memory jobs and the background jobs that generate artifacts (the delivery of chart images to Slack is covered) | SPK-2755 |
| Queries and exports that an agent starts, where they are not already checked against a grant | SPK-2756 |

Known behaviour that is not changed:

- With Slack identity enforcement off and no requirement to link an account,
  a Slack prompt runs as the person who installed the Slack app.
- An ordinary link unfurl in Slack renders as the person who installed the
  Slack app.

## 4. Credentials for the warehouse

| Credential | Removed when |
|---|---|
| The person's agent sign-in (Snowflake) | The person is deactivated through `UserModel.updateUser`, in the same transaction, with the flag on or off. The person is removed (the row goes with the user). A new sign-in for an inactive person is refused. |
| Shared agent account | The project or its warehouse connection is deleted, or an admin removes it. It belongs to the project, not to a person. |
| The organisation's Snowflake agent client | The organisation is deleted. An admin can replace it; there is no way to remove it. |
| A person's own credential for an external MCP server | The person is removed. Not on deactivation. |

Not promised:

- Work that already holds a warehouse client can finish.
- Nothing here calls the warehouse to revoke a token that it has already
  issued. How long such a token stays valid is up to the warehouse.
- Revoking a grant removes no warehouse credential.

## 5. Wider permissions

A grant stores what the person approved: capabilities, projects and resource
limits. An operation through a grant must pass each of these, separately:
the stored approval (`evaluateGrant`), the OAuth scopes of the token, the
current **Permissions**, and the person's ordinary authorisation. Saving
wider **Permissions** changes the policy rows and no grant.

So a wider policy can give back something that the person approved and that
was narrowed in between. It cannot give a grant a capability or a project
that the person did not approve. That needs a new grant. A new grant does
not revoke an older one.

## Caches

Two in-memory caches hold the signed-in person, with the person's ordinary
role and active state. Both exist only when `EXPERIMENTAL_CACHE=true`. With
the variable unset these two caches do not exist.

| Cache | Holds | Used by | Lifetime |
|---|---|---|---|
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

These numbers are for main as measured on 2026-10-11.

Set-up: two API processes from one build, one Postgres database,
`EXPERIMENTAL_CACHE=true` on both, the scheduler off. Four probes, polled
every 0.25 seconds: a browser session and a personal access token, on each
process. Before each trial the entries were left to expire, one request per
probe filled them, and the change was made straight after.

| Change | How it was made | Trials | Time until the last of the four probes saw it |
|---|---|---|---|
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
| `agent_revocation_contract.migration.integration.ts` | A revoked grant refuses its access token, its refresh and the check that queued work uses, and a second grant of the same person keeps working. A revoked refresh token ends the grant; a revoked access token does not. A removed project role, capability, allowed project, allowed person, group membership or "agents on" setting is seen by the next permission check, and a handle that was loaded before keeps its **Permissions**. A wider policy does not widen a stored grant. Deactivation deletes the agent sign-in, or rolls back when the delete fails. Removal deletes the person's grants, tokens and own credentials and keeps a shared credential for an external MCP server. |
| `oauth_access_revocation_clock.migration.integration.ts` | A grant's access token that is revoked on its own is refused at once while the API clock is fixed at 2000 and the database clock is later. The row stays bound, the grant and refresh token stay usable, and a second connection works. A repeated revoke changes nothing, an earlier expiry is kept, and the stored expiry is the same when the database session uses another time zone. |
| `oauth_refresh_rotation.migration.integration.ts` | With strict refresh handling, revoking a refresh token that is bound to no grant deletes its whole family; a refresh that is in flight cannot bring it back. |
| `agent_connection_grants.migration.integration.ts` | The rows that a grant revoke changes and keeps. |
| `agent_sign_in_deactivation.migration.integration.ts` | Deactivation and a new agent sign-in cannot both win, in either order. |

Unit tests, next to the code that they test:
`agentWorkAuthority.test.ts` pins the 30-second rule with a controlled clock
and the rule that the first failure is kept. `slackAccessRefusals.test.ts`,
`SchedulerTask.test.ts`, `ManagedAgentService.test.ts`,
`runEditDbtProjectPipeline.test.ts`, `AiWritebackService.test.ts` and
`AiAgentAdminService.test.ts` pin what each job does when a check refuses at
each of its points.

Not pinned by a test: the two-process measurement above (it needs two
running processes), and anything that the warehouse does with a token it has
already issued.

## Where it is in code

| What | Where |
|---|---|
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

Paths are under `packages/backend/src/`.
