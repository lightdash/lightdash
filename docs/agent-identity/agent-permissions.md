# Agent permissions: the capability contract

What each agent capability allows, how checks combine, what is covered, and
what is not. Words follow the [Agent identity glossary](./CONTEXT.md).

How soon a change to these permissions takes effect, and what happens to work
that is already queued, is in [revocation.md](./revocation.md).

The source of truth in code:

| What | Where |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Capability keys, plain names, what each allows | `AGENT_CAPABILITY_DEFINITIONS` in `packages/common/src/types/agentPermissions.ts` |
| Which operations need which capabilities | `packages/backend/src/auth/agentPermissions/capabilityMap.ts` |
| Operations only a person can do | `packages/backend/src/auth/agentPermissions/humanOnlyInManaged.ts` |
| The decision | `AgentPermissionService` (`evaluate`, `resolvePolicy`, `assertOperation`) |
| Coverage tests | `capabilityMap.test.ts`, `AgentPermissionService.test.ts` |

Capability checks and the people-only list apply only when the
`agent-identity` feature flag is on and "Limit what agents can do" is on.
MCP owns its two settings in every mode. The permission check does not read them.

## Group admission

Organization admins can set `allowedGroupUuids` through the policy API. `null`
allows everyone whose role allows AI. A non-empty list admits members of at
least one chosen group. A list whose groups are all deleted reads as `[]` and
admits nobody. An update that omits the field keeps the stored restriction.
An explicit empty list is rejected; use `null` to allow everyone.

Group admission applies with capability limits off (`legacy`) and on
(`managed`) when `agent-identity` is on. It covers MCP tools and resource reads,
in-app and Slack agents, OAuth REST, and query sources. Slack uses the verified
sender when a group restriction is active. Saved people and project lists no
longer restrict agents.

Groups are available when the deployment has a valid licence and the groups
flag is on for the organization. The API reports this as `groupsAvailable`.
New restrictions need groups to be available. A saved restriction still applies
if groups later become unavailable. An admin can always clear it with `null`.
Personal-access-token and service-account calls keep their existing exemptions.
The policy API accepts group admission in either mode. A PUT with
`mode: 'legacy'` preserves the stored role matrix and clears the capability
list. Omitting `mode` means managed. Reset keeps the group restriction.
GET, PUT and reset omit the old people and project choices. Old browser tabs
can still save them, but the server ignores them and clears the old columns.
The current page uses a temporary response adapter until the page rewrite.

## The 11 capabilities

Refusals and settings use the plain name. Never show the key to people.

| Key | Short name (matrix) | Plain name | Allows |
| ---------------- | ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `read_discover` | Read | Read and discover | Find and read projects, data models, content, context and existing query results. |
| `query` | Query | Query data | Run queries through data models and run saved semantic content. |
| `raw_sql` | Raw SQL | Raw SQL | List warehouse tables and write or run SQL directly. |
| `content_write` | Create / edit | Create and edit content | Create or edit charts, dashboards, documents and data apps. It does not change access, create spaces or share. |
| `delete` | Delete | Delete content | Delete content, files and objects. Other capabilities may also be needed. |
| `publish` | Publish | Publish and share | Publish, share or deliver content. |
| `deploy_upload` | Deploy | Deploy and upload | Deploy project changes and upload files. |
| `dbt_writeback` | dbt | Git repository changes (dbt) | Change any file in the project's Git repository, and open, update or close pull requests. Not only dbt files. |
| `export` | Export | Export results | Download results, render charts and export to supported destinations. |
| `administration` | Admin | Administration | Administrative actions mapped for agents. Changes reserved for people (see below) stay with people. |
| `external_tools` | External tools | External tools | Call tools enabled on a connected external service. It does not grant what those tools do downstream. |

Raw SQL for agents needs the person's own permission and the Raw SQL capability, and no project confirmation.

`get_query_result` is Read, not Query: it reads a result that already exists.
Warehouse table discovery is Raw SQL, because it reaches past the data models.

## Operations that need several capabilities

An operation that needs several capabilities is allowed only when every one is
allowed. Missing any one refuses it.

| Operation | Needs |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
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

## Organization capability limits

`allowedCapabilities: null` adds no limit to saved role grants. Existing
managed policies keep this value until their first save. A saved list limits
everyone, including people with custom roles. An empty list turns agents off
on every surface covered by this feature, including turns that need no
capability. The refusal points to the organization Agents settings page.

New policy defaults contain all eleven capabilities. Custom roles keep their
own agent permissions. The organization list can only narrow them.
With every capability ticked, limits on still keeps three safeguards that
"Same as the person" does not have: actions reserved for people, refusal of
unmapped operations, and a verified sender on Slack.

A managed save accepts an empty list but rejects explicit `null`. An omitted
list keeps the saved list or uses all eleven if no list is stored. Each role
row is intersected with the saved list and ordered by the capability enum.
Legacy saves and reset set the list to `null`. Reset keeps the dormant role
matrix and group restriction. A stale version rejects the entire save.

The Agents page offers three choices. Same as the person stores `legacy`
with a null capability list. Read and query stores `managed` with Read and
discover, Query data, Export results and Raw SQL in the list and every role row.
Custom stores `managed` with the selected list and role rows. It starts with
all eleven capabilities on; an organization that already saved a Custom list
gets that list back. Capability and group changes require review.
Raw SQL follows warehouse permissions; this preset is not a read-only SQL guard.

## How checks combine

Within a person's roles, capabilities add up (union). The system role matrix,
the person's custom roles and their group roles each add capabilities. A role
that leaves a capability out does not take it away from another role. The
organization list then intersects that union. A capability excluded by the
list points to the organization setting. A missing role grant within the list
keeps the role remedy, including the custom-role link when available.

Across independent checks, every check must pass (intersection). No check can
cancel another.

| Check | Where |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| The person's own permissions on the resource (CASL) | The service that does the work |
| The OAuth grant and token scopes, when OAuth enforcement is on | `fromOauth`, `scopedAbility.ts`, `mcpTools.ts` |
| Group admission, the organization list, and the capabilities from the person's roles | `AgentPermissionService.assertOperation` and `evaluate`  |
| Project, data and destination limits (pinned project, agent tags, SQL scope) | MCP, agent tools and data services |
| MCP settings                                                                         | MCP tool registration and configured-agent gates         |
| Operations only a person can do | `humanOnlyInManaged.ts`, `assertHumanManagedMutation.ts` |

The evaluator stops at the first refusal. The refusal names the check that
refused:

- The organization's agent permissions: "Your organization's agent
  permissions do not allow Export results. Ask an admin to change Permissions
  on the Agents page."
- The person's own permissions: "Your roles do not allow …".
- Anything else uses neutral text and never blames roles.

A managed refusal also lists the other blockers in `requiredCapabilities`, `blockers`, and `blockersComplete`. A See why link opens My agent identity. Blockers about a project the caller cannot see are left out.

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

## MCP settings

With `agent-identity` on, Enable agents over MCP appears on the Agents page
for people who can manage both organization and AI settings. It saves at once.
For those people, MCP settings shows its state and a link to the Agents page.
Other AI settings managers keep the working switch on MCP settings.
Allow content changes via MCP stays on MCP settings.

Both settings stay in `ai_organization_settings` and keep their defaults.
`AgentPermissionService` does not read either one. Their server-side
permission rules stay unchanged.

### Agents over MCP (`mcpAgentsEnabled`)

When off, MCP refuses `list_agents`, `route_agent`, `set_agent`,
`get_current_agent` and explicit configured-agent scope lookups. It hides
configured agents from project/context results and ignores saved agent context.
It does not stop in-app agents, Slack or OAuth API operations in either mode.
Other MCP tools still need their independent permissions.

### Allow content changes via MCP (`mcpContentWritesEnabled`)

When off, MCP hides `create_content`, `edit_content` and
`create_scheduled_delivery`. Calling a hidden tool returns the existing
missing-tool result. In-app, Slack and OAuth API content writes still need
their capabilities and ordinary permissions, but do not read this switch.

Organization/agent skills and data-app generation/iteration keep the existing
flag-off gaps in these MCP gates. They are tracked separately.

Previously, with limits on, Agents over MCP off refused agents on every
covered surface and the content switch refused content writes on every
surface. Use Who can use agents or capability limits to restrict other
surfaces. Untick every capability to turn agents off across covered surfaces.

### `requireExplicitSlackChannelLinking` (strict Slack channels)

The same in every mode. It is not behind the flag.

When on, it refuses linking an agent to a channel from Slack, and refuses
mentions in a channel with no linked agent before the system fallback or
picker. Mapped channels still use their agent. Admins can still link channels
in agent settings. Direct messages are a separate path.

Column `require_explicit_slack_channel_linking`, not null, default false.
The Slack settings panel shows it inverted as "Automatic channel linking".
Readers: `AiOrganizationSettingsService` and `AiAgentService`.

## Rolling updates

The additive migration is schema-compatible with old pods. Old API and worker
pods ignore the new organization list and can still grant an unticked
capability from a custom role. Keep `agent-identity` disabled, or defer policy
saves, until all serving pods use this version.
