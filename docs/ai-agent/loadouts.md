# Agent loadouts

Spec for the loadout resolver that builds the AI agent's tools and prompt
sections, replacing the hand-written conditionals in `getAgentTools`,
`systemV2.ts` and the intent gate. Terms are defined in [CONTEXT.md](CONTEXT.md) (Loadout, Base,
Add-on, Overlay); the decision and its alternatives are in
[ADR 0002](../composer-queries/adr/0002-agent-loadouts-are-one-base-plus-additive-add-ons.md).
Code: `packages/backend/src/ee/services/ai/loadout/`.

## Shape

```ts
type Loadout = {
    base: LoadoutBase;
    addOns: ReadonlySet<AddOnName>;
    toolNames: ReadonlySet<AgentToolName>;      // base tools ∪ add-on tools
    promptSections: ReadonlySet<PromptSection>; // base sections ∪ add-on sections
};

type BaseDefinition = (input: LoadoutInput) => {
    tools: readonly AgentToolName[];
    sections: readonly PromptSection[];
    accepts: readonly AddOnName[];
};

type AddOnDefinition = {
    description: string; // one line, for readers and agents
    when: (input: LoadoutInput) => boolean;
    tools: readonly AgentToolName[];
    section: { id: PromptSection; documents: readonly AgentToolName[] } | null;
};
```

`LoadoutInput` is the membership flags picked from `AiAgentArgs` plus three
derived values: runnable MCP tool names, attached MCP server count and custom
chart type count.

Resolution: pick the base from execution mode, the composer flag and data
access (classic is the fallback; the resolver never throws); evaluate the
base; keep every add-on the base accepts whose `when` holds; union.
`resolveAgentLoadout` runs once per turn in `prepareAgentTurn`, because the
MCP tool list and the custom chart library are loaded only there, and the
loadout is passed as an argument to `getAgentTools` and `getAgentMessages`.
Target, not yet: drop the membership booleans from `AiAgentArgs`.

## Bases

| Base | Chosen when | Query path | Accepts |
|---|---|---|---|
| `classic` | default | `generateVisualization`, `searchFieldValues`; `runQuery` and `exportChartAsCode` with the decisions client in standard mode; `runSql` when `canRunSql` | all add-ons |
| `composer` | composer flag on, data access on, standard mode, no tool allowlist | `runComposerQueries` and its `queryingComposer` section; no `runQuery`, `generateVisualization`, `runSql`, `exportChartAsCode` (it exports only semantic and merge charts) | all add-ons |
| `no_data_access` | data access off | core tools, `generateVisualization`; `runSql` when `canRunSql` | all add-ons |
| `deep_research_worker` | deep research, worker role | metadata tools, `generateVisualization`, `runSql` when raw SQL is allowed, `submitWorkerFindings` | `sqlCatalog` |
| `deep_research_coordinator` | deep research, coordinator role | core tools without hash/uuid generation, `generateVisualization`, `runSql` when raw SQL is allowed, `delegateResearchTask` | `contentReads`, `legacyDashboards`, `sqlCatalog`, `projectContext` |

Deep research narrows tools only: its bases render every applicable add-on
section. Its MCP tools (the project's own Lightdash server only) are merged
in `getAgentTools`, outside the loadout. Query-path variants are branches
inside the base function, not add-ons.

## Add-ons

| Add-on | `when` | Tools | Section |
|---|---|---|---|
| `contentReads` | content tools enabled | readContent, listContent, runContentQuery | none |
| `contentTools` | content tools enabled | editContent, createContent | contentTools |
| `scheduling` | content tools enabled | createScheduledDelivery | schedulingTools |
| `legacyDashboards` | content tools disabled | getDashboardCharts | none |
| `generateDashboard` | content tools disabled, can create dashboards | generateDashboard | none |
| `documents` | content tools and documents flag | none | documents |
| `generateDataApp` | data apps enabled | generateDataApp, iterateDataApp, listDataAppThemes, listDataAppConnections | generateDataApp |
| `sqlCatalog` | `canRunSql` | listWarehouseTables, describeWarehouseTable | runSql |
| `writeback` | writeback enabled | editDbtProject, syncDbtProject | aiWriteback |
| `codingAgent` | coding agent enabled | editRepo | codingAgent |
| `pullRequests` | writeback or coding agent | listWorkstreams, closePullRequest, getPullRequestDiff | none |
| `repoDiscovery` | repo discovery enabled | exploreRepo, discoverRepos | repoFs |
| `previewDeploySetup` | preview deploy setup enabled | setupPreviewDeploy | none |
| `editProjectContext` | review remediation thread | editProjectContext | none |
| `readAttachments` | thread has files | readAttachments | none |
| `intentRouting` | decisions client, standard mode | loadAgentTools | fastMetadata |
| `skills` | any skill available | loadSkill | skills |
| `mcp` | any runnable MCP tool | loadMcpTools | none |
| `mcpInventory` | any MCP server attached | none | mcpTools |
| `projectContext` | project context or memory enabled | loadProjectContext | projectContext |
| `memories` | memory enabled | none | memories |
| `customChartTypes` | library non-empty | findCustomChartTypes | availableCustomChartTypes |
| `userIdentity` | requesting user known | updateUserName | requestingUser |

`mcp` and `mcpInventory` are split: the MCP block lists attached servers
even without runnable tools. The `runSql` section belongs to `sqlCatalog` and also explains the base-owned
`runSql` and `runComposerQueries`.

## Plain conditionals

Flags that change wording or a schema branch but never add or remove a tool
stay as booleans on `AiAgentArgs`: `enableFilterExpressions`,
`enableComposerQueries` wording, `enableComposerPythonNodes`,
`enableDocumentNudges`, `enableDocumentCustomCharts`, chart export text,
`slackChannelId` and `slackLinksOnly` blocks, `enableDataAnswerFastResponse`,
and data-driven content: explores, knowledge documents, date, name, the MCP
server list and unauthenticated connections, and whether project context has
entries or was preloaded (rendered inside the `projectContext` section).

Rule: a flag joins the loadout when it changes which tools exist or which
sections render; otherwise it stays a plain conditional.

## Overlays

The intent gate (`referenceToolGating.ts`) and `execution.toolAllowlist`
(data app investigation) narrow a loadout for one turn. An overlay
intersects with the built tools; it never adds. An overlay may name tools of
mutually exclusive add-ons (`readContent` and `getDashboardCharts`), so each
overlay tool must appear in some resolved loadout, not all of one.

## Contract tests

`loadout/loadout.test.ts`, snapshots in `loadout/__snapshots__/`:

1. Each base with no add-ons, as JSON; `composer` also renders its prompt.
   `classic` renders byte-identical to `prompts/__fixtures__/systemV2.flag-off.txt`.
2. Each add-on on `classic`, names only.
3. Each base with every add-on it accepts, as JSON; `classic` and `composer`
   also render their prompts.
4. `classic` resolved from the capability flags renders byte-identical to
   `systemV2.flag-off-capabilities.txt`.
5. Structural: add-on tool sets pairwise disjoint; no base lists an add-on
   tool; every registered agent tool belongs to a base or an add-on; each
   section has one owner; a deferred section documents only its owner's or
   base tools; every overlay tool appears in a resolved loadout.

## Observability

Each turn logs `ai_agent.loadout_resolved` with `{ base, addOns, toolNames }`
and the prompt, thread, organization and project ids, so a rollout of the
`composer` base is visible per organization.

## First consumer

The composer-only agent (ZAP-1274) is the `composer` base. It owns the
`queryingComposer` section, which replaces the classic query path in the
prompt (tool workflow step, table calculations, custom metrics, field usage)
with one `runComposerQueries` path; add-on sections render their composer
wording from the same section. The `classic` snapshots stay byte-identical,
and no `composer` tool list or prompt names `runQuery`,
`generateVisualization` or `runSql`. The intent gate lists
`runComposerQueries` beside the classic query tools, so data and chart
intents keep a query tool on either base. Allowlisted read-only threads
(data-app investigations) stay on `classic`.

