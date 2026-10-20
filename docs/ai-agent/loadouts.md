# Agent loadouts

Spec for the loadout resolver that replaces the hand-written tool and prompt
conditionals in the AI agent. Terms are defined in [CONTEXT.md](CONTEXT.md)
(Loadout, Base, Add-on, Overlay); the decision and its alternatives are in
[ADR 0002](../composer-queries/adr/0002-agent-loadouts-are-one-base-plus-additive-add-ons.md);
the field research is on branch `research/agent-loadouts`.

## What it replaces

| Today | Where | Becomes |
|---|---|---|
| Tool inclusion conditionals | `getAgentTools`, `agents/agentV2.ts` | build exactly `loadout.toolNames` |
| Prompt section conditionals | `getCapabilitySections` and template branches, `prompts/systemV2.ts` | render exactly `loadout.promptSections`; wording flags stay |
| Section-to-tool map | `PROMPT_SECTION_TOOLS`, `utils/referenceToolGating.ts` | derived from add-on declarations |
| Build-everything-then-filter by name | deep research name sets, `toolAllowlist` | bases list their tools; allowlist is an overlay |

## Shape

```ts
type LoadoutBase =
    | 'classic'
    | 'composer'
    | 'no_data_access'
    | 'deep_research_worker'
    | 'deep_research_coordinator';

type Loadout = {
    base: LoadoutBase;
    addOns: ReadonlySet<AddOnName>;
    toolNames: ReadonlySet<string>;        // base tools ∪ add-on tools
    promptSections: ReadonlySet<string>;   // base sections ∪ add-on sections
};

type BaseDefinition = (args: AiAgentArgs) => {
    tools: readonly string[];
    sections: readonly string[];
    accepts: readonly AddOnName[];
};

type AddOnDefinition = {
    description: string;                    // one line, for readers and agents
    when: (args: AiAgentArgs) => boolean;
    tools: readonly string[];
    section: string | null;
};

const resolveLoadout = (args: AiAgentArgs): Loadout;
```

Resolution: pick the base from execution mode, data access and the composer
flag (classic is the fallback, the resolver never throws); evaluate the base
definition; keep every add-on the base accepts whose `when` holds; union.
It runs once, in `AiAgentService`, and the `Loadout` value replaces the
membership booleans on `AiAgentArgs`. `getAgentTools` and `getSystemPromptV2`
read it; they no longer evaluate `enable*` flags for membership.

## Bases

| Base | Chosen when | Query path | Accepts |
|---|---|---|---|
| `classic` | default | `runQuery`, `generateVisualization`, `runSql` when `canRunSql` | all add-ons |
| `composer` | composer flag on, data access on, standard mode | `runComposerQueries`; no `runQuery`, `generateVisualization`, `runSql` | all add-ons |
| `no_data_access` | agent setting off | metadata tools only | skills, mcp, userIdentity |
| `deep_research_worker` | deep research, worker role | per existing worker name set | mcp |
| `deep_research_coordinator` | deep research, coordinator role | per existing coordinator name set, plus `delegateResearchTask` | mcp |

Query-path variants are branches inside the base function, not add-ons:
filter expressions, Python nodes, SQL on or off, warehouse connection count.

## Add-ons

| Add-on | `when` | Tools | Section |
|---|---|---|---|
| `contentTools` | content tools enabled | readContent, editContent, listContent, createContent, createScheduledDelivery, runContentQuery | content_tools, scheduling_tools |
| `legacyDashboards` | content tools disabled | getDashboardCharts, generateDashboard | none |
| `documents` | contentTools and documents flag | none | documents |
| `generateDataApp` | data apps enabled | generateDataApp, iterateDataApp, listDataAppThemes, listDataAppConnections | generate_data_app |
| `sqlCatalog` | `canRunSql` | listWarehouseTables, describeWarehouseTable | none |
| `writeback` | writeback enabled | editDbtProject, syncDbtProject | ai_writeback |
| `codingAgent` | coding agent enabled | editRepo | coding_agent |
| `pullRequests` | writeback or coding agent | listWorkstreams, closePullRequest, getPullRequestDiff | none |
| `repoDiscovery` | trusted identity | exploreRepo, discoverRepos | repo_fs |
| `previewDeploySetup` | flag and writeback | setupPreviewDeploy | none |
| `editProjectContext` | review remediation thread | editProjectContext | none |
| `readAttachments` | thread has files | readAttachments | none |
| `intentRouting` | decisions client present, standard mode | runQuery, exportChartAsCode, loadAgentTools | fast_metadata blocks |
| `skills` | any skill available | loadSkill | skills |
| `mcp` | any MCP server | loadMcpTools and the server tools | mcp_tools |
| `projectContext` | project context or memory enabled | loadProjectContext | project_context |
| `customChartTypes` | library non-empty | findCustomChartTypes | available_custom_chart_types |
| `userIdentity` | requesting user known | updateUserName | requesting_user |

`documents` contributes a section only, and `intentRouting` is in the loadout
because it changes membership even though it reads like a wording flag.
`runQuery` listed under `intentRouting` is subject to the base: `composer`
does not accept it, so the `composer` base's `accepts` omits the query tools
of that add-on; resolve this by splitting `intentRouting` into
`intentRouting` (loadAgentTools, fast metadata blocks) and `classicQuery`
(runQuery, exportChartAsCode) accepted by `classic` only, if the simpler
split reads better during implementation.

## Plain conditionals

Flags that change wording or a schema branch but never add or remove a tool
stay as booleans on `AiAgentArgs` and keep their per-variant snapshot tests:
`enableFilterExpressions`, `enableComposerPythonNodes`,
`enableDocumentNudges`, `enableDocumentCustomCharts`, chart export text,
`slackChannelId` and `slackLinksOnly` blocks, `enableDataAnswerFastResponse`,
and data-driven template fields (explores, knowledge documents, date, name).

Rule: a flag joins the loadout when it changes which tools exist or which
sections render; otherwise it stays a plain conditional.

## Overlays

The intent gate (`referenceToolGating.ts`) and `execution.toolAllowlist`
(data app investigation) narrow a loadout for one turn. An overlay intersects
with `loadout.toolNames`; it never adds. The intent gate's per-section tool
lists are derived from add-on declarations, so the three hand-written lists
collapse to the base and add-on registries.

## Contract tests

One readable JSON snapshot per case, each listing base, add-ons, tool names
and section ids, plus the rendered prompt where noted:

1. Each base with no add-ons (5), with the rendered prompt. `classic` must be
   byte-identical to today's flag-off fixture.
2. Each add-on on `classic` (18), names only.
3. Each base with every add-on it accepts (5), with the rendered prompt.
   `classic` must match today's flag-off-plus-capabilities fixture.
4. Structural: add-on tool sets pairwise disjoint; every registered agent tool
   belongs to exactly one base or add-on; every overlay list is a subset of
   some loadout.

About 28 snapshots. Plain conditionals keep their existing tests inside the
tool or section they live in.

## Observability

Record `{ base, addOns, toolNames }` per thread turn, as the deep research
execution snapshot already records `enabledToolNames`, so a rollout of the
`composer` base is visible per organization after the fact.

## First consumer

The composer-only agent (ZAP-1274) is the `composer` base. Its completion
check: the `composer` base snapshot exists, the `classic` snapshots are
byte-identical to today's fixtures, and `runQuery`, `generateVisualization`
and `runSql` appear in no `composer` snapshot.

## For the implementing agent

The implementation adds `packages/backend/src/ee/services/ai/loadout/` with a
`CLAUDE.md` written for agents: the four terms, the recipe to add a tool
(choose base or add-on, add the entry with its `description`, run the loadout
tests, commit the snapshot), and the plain-conditional rule above. The
snapshot JSON is the contract an agent reads without running code.
