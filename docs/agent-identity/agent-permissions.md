# Agent permissions: the capability contract

What each agent capability allows, how checks combine, what is covered, and
what is not. Words follow the [Agent identity glossary](./CONTEXT.md).

The source of truth in code:

| What | Where |
|---|---|
| Capability keys, plain names, what each allows | `AGENT_CAPABILITY_DEFINITIONS` in `packages/common/src/types/agentPermissions.ts` |
| Which operations need which capabilities | `packages/backend/src/auth/agentPermissions/capabilityMap.ts` |
| Operations only a person can do | `packages/backend/src/auth/agentPermissions/humanOnlyInManaged.ts` |
| The decision | `AgentPermissionService` (`evaluate`, `resolvePolicy`, `assertOperation`) |
| Coverage tests | `capabilityMap.test.ts`, `AgentPermissionService.test.ts` |

Capability checks and the people-only list apply only when the
`agent-identity` feature flag is on and "Limit what agents can do" is on.
The legacy switches at the end of this page apply in every mode.

## The 11 capabilities

Refusals and settings use the plain name. Never show the key to people.

| Key | Short name (matrix) | Plain name | Allows |
|---|---|---|---|
| `read_discover` | Read | Read and discover | Find and read projects, data models, content, context and existing query results. |
| `query` | Query | Query data | Run queries through data models and run saved semantic content. |
| `raw_sql` | Raw SQL | Raw SQL | List warehouse tables and write or run SQL directly. Also needs the project's warehouse confirmation. |
| `content_write` | Create / edit | Create and edit content | Create or edit charts, dashboards, documents and data apps. It does not change access, create spaces or share. |
| `delete` | Delete | Delete content | Delete content, files and objects. Other capabilities may also be needed. |
| `publish` | Publish | Publish and share | Publish, share or deliver content. |
| `deploy_upload` | Deploy | Deploy and upload | Deploy project changes and upload files. |
| `dbt_writeback` | dbt | Git repository changes (dbt) | Change any file in the project's Git repository, and open, update or close pull requests. Not only dbt files. |
| `export` | Export | Export results | Download results, render charts and export to supported destinations. |
| `administration` | Admin | Administration | Administrative actions that agents may do. Access, credential and identity changes stay with people. |
| `external_tools` | External tools | External tools | Call tools enabled on a connected external service. It does not grant what those tools do downstream. |

`get_query_result` is Read, not Query: it reads a result that already exists.
Warehouse table discovery is Raw SQL, because it reaches past the data models.

## Operations that need several capabilities

An operation that needs several capabilities is allowed only when every one is
allowed. Missing any one refuses it.

| Operation | Needs |
|---|---|
| Scheduled delivery (create, edit, enable, change owner), on MCP, in-app, Slack and REST | Create and edit content + Publish and share |
| Google Sheets sync as code | Create and edit content + Publish and share |
| Run a saved SQL chart | Query data + Raw SQL |
| Create a SQL chart or virtual view | Create and edit content + Raw SQL |
| Edit a saved SQL chart, any field, on every surface | Create and edit content + Raw SQL |
| Delete a file in the Git repository, through REST or a repo-edit agent tool | Delete content + Git repository changes (dbt) |
| Pull content from Git | Git repository changes (dbt) + Create and edit content |
| Set up a preview deploy | Deploy and upload + Git repository changes (dbt) |
| Create a project, upload metadata or precompiled files | Deploy and upload + Administration |
| Embed settings and access grants | Publish and share + Administration, and often only a person |

Editing a SQL chart's title or chart settings needs Raw SQL today, to match
REST. We may narrow this later to edits that change the SQL.

A repo-edit agent tool (`editRepo`, `editDbtProject`, MCP `run_ai_writeback`)
needs Delete only when its change deletes or renames a file. Adding and
changing files needs Git repository changes (dbt) alone. The check reads the
sandbox's changes after the coding agent finishes and before anything is
committed or pushed. `editProjectContext` writes one file and never deletes,
so it has no delete check.

These checks on what a tool call actually does are listed in
`AGENT_TOOL_EFFECT_CAPABILITIES` in `capabilityMap.ts`. They apply where the
tool's own agent check applies, so personal access tokens stay outside them.
One exception: a repo-edit job queued before this change does not record how
it was started. Such a job from MCP is treated as covered, even if a personal
access token started it. This lasts only until old jobs and old servers are
gone.

## Operations only a person can do

Some operations are refused for agents whatever capabilities are allowed:
roles, groups, project and space access, custom roles, service accounts,
personal access tokens, invite links, OAuth clients, the agent permission
policy itself, agent identity rules, feature flag overrides, the Google Drive
access token, and AI organization settings. The full list is in
`humanOnlyInManaged.ts`. Granting Administration does not change this.

This list is not yet complete. Some credential and settings changes still
need only Administration, for example AI provider credentials, connector
credentials, warehouse credentials, the embed secret and impersonation
settings. A wider review of these is pending. Until then, do not describe
Administration as unable to change credentials.

## Unknown operations

Every MCP tool, in-app and Slack agent tool, and OAuth-reachable REST route
has an explicit entry in `capabilityMap.ts`. Nothing is classified by HTTP
verb or tool annotations. Tests fail when a registered tool or route has no
entry. An operation with no entry is refused (`agent_operation_unmapped`).
Connected external tools always need External tools, and only tools enabled
on that connection are callable.

## All, none and inherited

These are states of the stored policy, not new stored values.

| Setting | All | None | Inherited |
|---|---|---|---|
| Projects (`allowedProjectUuids`) | `null`: every project the person can use. | `[]`: no project. Organization-level discovery that needs only Read still works. | Not used. |
| Who can use agents (`allowedUserUuids`) | `null`: "Everyone the roles allow". | `[]`: no one's agents can run. | An update that leaves the field out keeps the stored list. |
| A role's capabilities | Every capability listed explicitly. Never a wildcard, so a new capability is not granted by default. | Empty list: this role grants nothing. Another role can still grant. | Not used for capabilities. |
| "Limit what agents can do" off (`mode: legacy`) | Not "all". Agents keep the person's ordinary permissions, and the old switches still apply. | Not "none". | This is the only inherited state: agents inherit the person's permissions with no capability limit. |

## How checks combine

Within a person's roles, capabilities add up (union). The system role matrix,
the person's custom roles and their group roles each add capabilities. A role
that leaves a capability out does not take it away from another role.

Across independent checks, every check must pass (intersection). No check can
cancel another.

| Check | Where |
|---|---|
| The person's own permissions on the resource (CASL) | The service that does the work |
| The OAuth grant and token scopes, when OAuth enforcement is on | `fromOauth`, `scopedAbility.ts`, `mcpTools.ts` |
| Who can use agents, projects, and the capabilities from the person's roles | `AgentPermissionService.assertOperation` and `evaluate` |
| Project, data and destination limits (pinned project, agent tags, SQL scope) | MCP, agent tools and data services |
| Raw SQL warehouse confirmation for the current binding | `AgentPermissionService.evaluate` |
| Legacy switches | See the inventory below |
| Operations only a person can do | `humanOnlyInManaged.ts`, `assertHumanManagedMutation.ts` |

The evaluator stops at the first refusal. The refusal names the check that
refused:

- The organization's agent permissions: "Your organization's agent
  permissions do not allow Export results. Ask an admin to change Permissions
  on the Agents page."
- The person's own permissions: "Your roles do not allow …".
- Anything else uses neutral text and never blames roles.

Showing every check at once is step 2 of this work.

## What is not covered

**Personal access tokens are not covered by agent permissions.** MCP checks
run only for OAuth and session requests (`McpService` returns early for other
auth types). The REST check runs only for OAuth (`middlewares.ts`). A PAT
used by an agent is treated as the person. Normal permissions, the MCP
switches and warehouse rules still apply to it. Do not describe agent
permissions as covering every AI client.

**OAuth scopes keep their old meaning.** `read`, `write`, `mcp:read` and
`mcp:write` are separate from the 11 capabilities. `read` and `mcp:read`
include the SQL runner and exports. Scope enforcement has null, log and
enforce modes; log mode records but does not refuse.

## Legacy switch inventory (for step 3)

All three live in `ai_organization_settings`. They are written through
`AiOrganizationSettingsService.upsertSettings` (PATCH on
`AiAgentAdminController`). When "Limit what agents can do" is on, only a
person can call it. Step 1 does not change them.

### `mcpAgentsEnabled` refuses every agent surface when limits are on

This is the most important finding for step 3. Its label says MCP agents, but
when "Limit what agents can do" is on, turning it off stops every agent.

| Mode | What it blocks when off |
|---|---|
| Flag off | MCP agent-selection tools (`list_agents`, `route_agent`, `set_agent`, `get_current_agent`) and explicit `agentUuid` scope lookups. Hides agents in project and context listings and ignores a saved selected agent and its tags. Other MCP tools, Ask AI and Slack still work. |
| Flag on, limits off (`legacy`) | Same as flag off. |
| Flag on, limits on (`managed`) | Everything above, and every operation that reaches `AgentPermissionService`: MCP over OAuth and session, in-app agent turns and tools, Slack, OAuth REST and connected tools. The refusal is `agent_access_disabled`. PAT traffic gets only the flag-off behaviour. |

Column `mcp_agents_enabled`, not null, default true. A missing settings row
reads as true. Readers: `AiOrganizationSettingsService` (decision helper),
`AgentPermissionService` (managed evaluator), `McpService` (agent listing,
selected agent, agent tags, agent tools). Frontend: MCP general settings and
AI general settings pages.

### `mcpContentWritesEnabled`

| Mode | What it blocks when off |
|---|---|
| Flag off, or limits off | MCP does not register `create_content`, `edit_content` and `create_scheduled_delivery`. Data app tools and writeback have their own checks. In-app and Slack content tools are not affected. |
| Limits on (`managed`) | Every operation that needs Create and edit content, on every surface. This includes scheduled deliveries, data app creation and REST edits. Delete, Publish-only, Deploy and Git repository operations are not affected. The refusal is `agent_setting_denied`. |

Column `mcp_content_writes_enabled`, not null, default true. Readers:
`AiOrganizationSettingsService`, `AgentPermissionService`, `McpService` and
`mcpRouter` (per-request tool registration).

### `requireExplicitSlackChannelLinking` (strict Slack channels)

The same in every mode. It is not behind the flag.

When on, it refuses linking an agent to a channel from Slack, and refuses
mentions in a channel with no linked agent before the system fallback or
picker. Mapped channels still use their agent. Admins can still link channels
in agent settings. Direct messages are a separate path.

Column `require_explicit_slack_channel_linking`, not null, default false.
The Slack settings panel shows it inverted as "Automatic channel linking".
Readers: `AiOrganizationSettingsService` and `AiAgentService`.

When step 3 folds these into the policy, it must keep each one's real reach,
its default, the inverted Slack toggle, and the scheduled delivery side
effect of content writes.
