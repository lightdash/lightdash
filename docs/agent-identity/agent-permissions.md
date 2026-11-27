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
`agent-identity` feature flag is on and the organization, or the project the
operation targets, restricts agents. MCP owns its two settings whether or not
agents are restricted. The permission check does not read them.

## Group admission

Organization admins can set `allowedGroupUuids` through the policy API. `null`
allows everyone whose role allows AI. A non-empty list admits members of at
least one chosen group. A list whose groups are all deleted reads as `[]` and
admits nobody. An update that omits the field keeps the stored restriction.
An explicit empty list is rejected; use `null` to allow everyone.

Group admission applies with or without capability restrictions when
`agent-identity` is on. It covers MCP tools and resource reads,
in-app and Slack agents, OAuth REST, and query sources. Slack uses the verified
sender when a group restriction is active. Saved people and project lists no
longer restrict agents.

Groups are available when the deployment has a valid licence and the groups
flag is on for the organization. The API reports this as `groupsAvailable`.
New restrictions need groups to be available. A saved restriction still applies
if groups later become unavailable. An admin can always clear it with `null`.
Personal-access-token and service-account calls keep their existing exemptions.
The policy has no mode: a saved capability list restricts agents and `null`
means no restrictions. The policy API accepts group admission either way. A PUT
with `allowedCapabilities: null` clears the capability list. Omitting
`allowedCapabilities` keeps the saved list.
Reset keeps the group restriction. A PUT that still sends `mode` or
`systemRoleMatrix` gets no error; the server ignores both.
GET, PUT and reset omit the old people and project choices. Old browser tabs
can still save them, but the server ignores them and clears the old columns.
The Agents page uses the capability-policy API for its two choices, No
restrictions and Restrict.

## Personal CLI admission by surface

A browser login for `lightdash-cli` with no agent connection grant is a person
using a tool, like a personal access token (PAT), on REST. Its session has a
fixed eight-hour deadline. Refresh does not extend it. The client id is public;
this is an admission rule, not proof of a private client.

| Surface | Personal CLI browser login | PAT |
| --- | --- | --- |
| REST | Skips agent group admission and capability checks. OAuth scopes and human-only admin guards still apply. | Keeps the existing agent policy exemption and role checks. |
| MCP, including agent tools and resource reads | Refused: browser login requests `read write`, but MCP requires `mcp:read` or `mcp:write`. | Admitted subject to MCP settings, resource access and role checks; keeps the existing agent policy exemption. |
| `lightdash agent connect` and `agent revoke --human` | Refused. Log in with `lightdash login <url> --token <personal access token>` first. | Admitted subject to the existing person and organization checks. |

The REST exemption does not change MCP policy. If a CLI OAuth token has MCP
scopes through another flow, MCP treats it as OAuth and applies agent admission
and capability checks. PATs remain exempt, including MCP tool effects
and new queued repo-edit jobs. Old jobs without a saved caller rule keep the
conservative policy described below. Grant-bound CLI tokens keep agent
admission, capability and grant checks.

The REST rule is in `controllers/authentication/middlewares.ts`. Browser login
requests its scopes in `packages/cli/src/handlers/oauthLogin.ts`.
`McpService.canAccessMcp` checks MCP scopes, and `auth/agentPermissions/caller.ts`
sets MCP agent policy applicability for tools, effects and queued repo-edit jobs.

## The 11 capabilities

Refusals and settings use the plain name. Never show the key to people.

| Key | Short name | Plain name | Allows |
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
| Create a project, upload metadata or precompiled files | Deploy and upload + Administration |
| Embed settings and access grants | Publish and share + Administration, and often only a person |

Editing a SQL chart's title or chart settings needs Raw SQL today, to match
REST. We may narrow this later to edits that change the SQL.

A repo-edit agent tool (`editDbtProject`, MCP `run_ai_writeback`)
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

## Agent restrictions

Roles describe the person. Agents start from everything the person can do, and
one policy narrows it. The policy never adds a permission. Roles, including
custom roles, carry no agent capabilities of their own.

The organization policy is the default for every project.
`allowedCapabilities: null` means no restrictions. A saved list allows only
the listed capabilities, for everyone. An empty list turns agents off on every
surface covered by this feature, including turns that need no capability. The
refusal points to the organization Agents settings page.

A project can have its own policy. It replaces the organization list for
operations in that project; it does not combine with it. A project row with a
`null` list means no restrictions in that project, even when the organization
restricts agents. A project row with a list restricts agents in that project,
even when the organization does not. Deleting the row makes the project follow
the organization again. Group admission is set for the organization only.

| Route | Does |
| --- | --- |
| `GET /api/v2/org/agent-permissions` | Reads the organization policy. |
| `PUT /api/v2/org/agent-permissions` | Saves the organization list and group admission. |
| `POST /api/v2/org/agent-permissions/reset` | Clears the organization list. Keeps group admission. |
| `GET /api/v2/org/agent-permissions/projects` | Lists the projects that have their own policy. |
| `PUT /api/v2/org/agent-permissions/projects/{projectUuid}` | Saves a project policy. |
| `DELETE /api/v2/org/agent-permissions/projects/{projectUuid}` | Removes it, so the project follows the organization. |

An organization save with an omitted list keeps the saved list; a new policy
starts with no restrictions. A stale version rejects the entire save.

With every capability ticked, a restricted policy still keeps three safeguards
that No restrictions does not have: actions reserved for people, refusal of
unmapped operations, and a verified sender on Slack.

The Agents page offers two choices. No restrictions stores a `null` list.
Restrict stores the selected list. It starts with all eleven capabilities on;
an organization that already saved a list gets that list back. Capability and
group changes require review. A project's Agent identity page offers Use
organization setting, No restrictions and Restrict.
Raw SQL follows warehouse permissions; allowing only read and query
capabilities is not a read-only SQL guard.

## How checks combine

The policy that applies is the project's own, when the operation targets a
project that has one, and the organization's otherwise. A capability outside
that list is refused, whatever roles the person holds.

Across independent checks, every check must pass (intersection). No check can
cancel another.

| Check | Where |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| The person's own permissions on the resource (CASL) | The service that does the work |
| The OAuth grant and token scopes | `fromOauth`, `scopedAbility.ts`, `mcpTools.ts` |
| Group admission and the organization or project capability list | `AgentPermissionService.assertOperation` and `evaluate`  |
| Project, data and destination limits (pinned project, agent tags, SQL scope) | MCP, agent tools and data services |
| MCP settings                                                                         | MCP tool registration and configured-agent gates         |
| Operations only a person can do | `humanOnlyInManaged.ts`, `assertHumanManagedMutation.ts` |

Agent connections enforce their stored approval and token scopes. Current
**Permissions** and the person's ordinary permissions can narrow them further.

The evaluator stops at the first refusal. The refusal names the check that
refused:

- The organization's agent permissions: "Your organization's agent
  permissions do not allow Export results. Ask an admin to change Permissions
  on the Agents page."
- The person's own permissions: "Your roles do not allow …".
- Anything else uses neutral text and never blames roles.

A capability refusal also lists the other blockers in `requiredCapabilities`, `blockers`, and `blockersComplete`. A See why link opens My agent identity. Blockers about a project the caller cannot see are left out.

## What is not covered

**Personal access tokens are not covered by agent permissions.** MCP checks
run only for OAuth and session requests (`McpService` returns early for other
auth types). The REST check runs only for OAuth (`middlewares.ts`). A PAT
used by an agent is treated as the person. Normal permissions, the MCP
switches and warehouse rules still apply to it. Do not describe agent
permissions as covering every AI client.

### Local CLI programs

An agent connection limits the projects and actions available to requests that use
its credential. Programs the CLI starts run as your computer user and can still
read your files, including your saved personal API key and connection tokens.
Removing the API key from those programs' environment helps avoid accidental use
or exposure; it does not isolate those programs from your account or files.

See [Scoped CLI credentials](../../packages/cli/README.md#scoped-cli-credentials)
for environment and file access.

### OAuth scopes

**OAuth scopes keep their old meaning.** `read`, `write`, `mcp:read` and
`mcp:write` are separate from the 11 capabilities. `read` and `mcp:read`
include the SQL runner and exports. Every OAuth token is limited to its
scopes, with no feature flag. A token with no scopes has no access, and OAuth
tokens cannot create personal access tokens, service accounts, SCIM tokens or
OAuth clients. Until 15 March 2027, browser login in CLI releases before
3.88.0 can still create a personal access token that expires after at most 8
hours, outside organizations with `agent-identity` on. That token cannot be
rotated and cannot create or rotate credentials.

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

When off, MCP refuses `list_agents`, `route_agent` and explicit
configured-agent scope lookups. It hides
configured agents from project/context results and ignores saved agent context.
It does not stop in-app agents, Slack or OAuth API operations.
Other MCP tools still need their independent permissions.

### Allow content changes via MCP (`mcpContentWritesEnabled`)

When off, MCP hides `create_content`, `edit_content` and
`create_scheduled_delivery`. Calling a hidden tool returns the existing
missing-tool result. In-app, Slack and OAuth API content writes still need
their capabilities and ordinary permissions, but do not read this switch.

Organization/agent skills and data-app generation/iteration keep the existing
flag-off gaps in these MCP gates. They are tracked separately.

Previously, when agents were restricted, Agents over MCP off refused agents on every
covered surface and the content switch refused content writes on every
surface. Use Who can use agents or capability limits to restrict other
surfaces. Untick every capability to turn agents off across covered surfaces.

### `requireExplicitSlackChannelLinking` (strict Slack channels)

The same with or without agent restrictions. It is not behind the flag.

When on, it refuses linking an agent to a channel from Slack, and refuses
mentions in a channel with no linked agent before the system fallback or
picker. Mapped channels still use their agent. Admins can still link channels
in agent settings. Direct messages are a separate path.

Column `require_explicit_slack_channel_linking`, not null, default false.
The Slack settings panel shows it inverted as "Automatic channel linking".
Readers: `AiOrganizationSettingsService` and `AiAgentService`.
