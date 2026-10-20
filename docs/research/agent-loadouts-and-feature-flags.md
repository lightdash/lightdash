# Agent loadouts and feature flags

Research for ZAP-1272, fetched 2026-10-20 from primary sources (official docs and repos). Answers: how agent
products declare a capability bundle (tools + prompt sections), version prompt and tools together, roll out
or kill-switch a major change, and test combinations; then a recommendation for this codebase.

## The problem here

`getAgentTools` (`packages/backend/src/ee/services/ai/agents/agentV2.ts`) and the prompt's
`getCapabilitySections` (`packages/backend/src/ee/services/ai/prompts/systemV2.ts`) are two hand-written
conditional lists over the `enable*` booleans of `AiAgentArgs` (`types/aiAgent.ts`: 15 `enable*` args plus
`canRunSql`, `slackLinksOnly`, execution mode). The booleans are resolved in `AiAgentService` from a mix of
feature flags (`FeatureFlags.ComposeSqlRunner`, `PythonQueryRunner`, `AiFilterExpressions`, ...), agent
settings (`enableDataAccess`, `enableContentTools`, ...), org settings, and execution mode (`deep_research`).
Nothing names a combination. Tests pin two prompt fixtures (flag-off; flag-off + every capability) and a tool
contract snapshot keyed on one boolean (`enableFilterExpressions`). The first consumer of a better shape is
the composer-only agent: under the composer flag, `runQuery`, `generateVisualization` and `runSql` leave the
tool set and the prompt's query guidance becomes one positive composer path.

## Comparison

A = capability bundle as a named unit. B = prompt and tools versioned as one artifact. C = runtime rollout /
kill-switch. D = testing combinations. "NV" = not verified from a primary source.

| Product | A: named bundle | B: versioned together | C: rollout / kill-switch | D: testing combinations |
|---|---|---|---|---|
| Claude Code / Agent SDK | Subagent file (`name`, `description`, `tools`, `disallowedTools`, `model`, `skills`, `mcpServers`, prompt body); plugin = skills+agents+hooks+MCP "as one unit"; SDK `AgentDefinition` object; `tools: {preset:'claude_code'}` and `systemPrompt: {preset, append}` | Yes: file carries prompt+tools, "check them into version control"; plugin `version` pins; SDK `systemPrompt.snapshot` freezes the prompt per session | Permission rules deny > ask > allow, "a bare tool name like `Bash` removes the tool from Claude's context entirely"; managed settings nothing overrides; `enabledPlugins`; `skillOverrides` on/name-only/off | `claude plugin eval`: prompt + graders (regex, `tool_used`, rubric), scored WITH vs W/OUT the plugin, CI threshold. No snapshot of resolved tool sets |
| OpenAI Agents SDK | `Agent(instructions, tools, handoffs, mcp_servers, model_settings)`; `clone()` | Server-side `prompt` object (id+version) existed but "OpenAI is deprecating reusable prompt objects"; shutdown 2026-11-30; recommends git, release tags, feature flags | `is_enabled` per tool: bool or callable on run context, "disabled tools are completely hidden from the LLM"; dynamic `instructions` function; guardrails | Not documented |
| Codex CLI | Custom agent TOML (`developer_instructions`, model keys; tools/MCP inherited from parent); profile files `$CODEX_HOME/<name>.config.toml`; AGENTS.md layering | Partial: agent file holds prompt+model, not tools; git only | Precedence CLI > project > profile > user > cloud-managed > system; `[features]` table; `mcp_servers.<id>.enabled`, `enabled_tools`/`disabled_tools`; admin `requirements.toml` users cannot override | Not documented |
| GitHub Copilot | `*.agent.md` frontmatter `name`, `description`, `tools`, `model`, `mcp-servers`, `handoffs`; `.instructions.md` with `applyTo` globs; prompt files; tool sets `.jsonc` | Yes: "versioning is based on Git commit SHAs for the agent profile file"; repo > org > enterprise, "lowest level overrides" | Per-request tool picker (max 128 tools); settings toggles; org policies; device policies (`ChatAgentMode`, `ChatMCP`) override settings | Manual: "test instructions with a representative task"; Diagnostics view lists what loaded. No evals |
| Cursor | Rules `.mdc` (`alwaysApply`, `globs`, description-triggered); Skills `SKILL.md` with `scripts/`; `.cursor/mcp.json`. Rules carry no tools or model | No single artifact; rules, MCP, hooks, permissions are separate committed files; Team Rules live in the dashboard | MCP server on/off; `permissions.json` allowlists, file-watched; hooks `deny > ask > allow`; enterprise allowlists "do not merge" | None documented |
| Vercel AI SDK | `ToolLoopAgent({model, instructions, tools, activeTools, stopWhen})`, "a single place to define your agent's behavior"; `ToolSet` typing | Code object only; `customProvider` aliases for model versions | `activeTools` per call; `prepareStep` returns `activeTools`/`model` per step; `prepareCall` + `callOptionsSchema` typed per-request options ("limit tools based on user role"); middleware | `ai/test`: `MockLanguageModelV4`, `mockValues`, `simulateReadableStream`. No matrix/snapshot guidance |
| LangGraph / LangChain 1.x | `create_agent` harness = prompt+tools+middleware; Deep Agents subagent `{name, description, system_prompt, tools}`; Platform assistant = graph + config | Assistants: "each update creates a new version", config covers "prompts, LLM selection, tools"; LangSmith prompt commits store tool schemas + model config | Middleware `request.override(tools=..., system_message=...)` from flags in Store/context; "all available tools need to be registered upfront"; assistant active version promote/rollback; prompt tags `production`/`staging` | pytest plugin with cassette caching; experiments compare versions, trajectory evaluators. No combination snapshots |
| Google ADK | `LlmAgent(name, instruction, tools)`; `BaseToolset` = named tool bundle; Agent Config YAML (experimental) | YAML holds instruction+tools+sub_agents; code agents git only; Agent Engine versioning NV | `BaseToolset(tool_filter=predicate | [names])` evaluated per request with `ReadonlyContext`; `before_tool_callback` returning a dict skips the tool; `before_model_callback` mutates the request | `adk eval` evalsets, `tool_trajectory_avg_score` exact-match default 1.0, pytest `AgentEvaluator`. One agent module per run |
| LaunchDarkly AgentControl (ex-AI Configs) | Config with variations: model + params + instructions + attached project-level versioned tools; agent mode | Per-variation integer versions; tools are "reusable, versioned resources" | Flag targeting, percentage and guarded rollouts, "turn targeting off to serve the off variation"; current SDKs have no default-value arg, `invoke()` throws when off | Playground, offline evals on datasets, online judges, experiments (not with guarded rollout at once) |
| Statsig | Prompts: version = model + params + text; no tool concept; Dynamic Configs = server JSON | Numbered versions with Live/Candidate; "promote the best version to Live" | Gates default false, kill = 0%; progressive traffic shift between prompt versions; per-key config defaults | Offline evals on fixed sets; online shadow runs of Candidates; Layers: "no user is in more than one experiment in that layer" |
| PostHog | Prompt = text + variables + JSON `config`; flags with JSON payloads; remote config | "Every prompt change creates a new immutable version"; labels are movable pointers | Label switch for prompts; flag percentage/multivariate; SDK cache + fallback value | Prompt experiments (one flag variant per version), LLM-judge evals |
| GrowthBook | No AI object; JSON features with schema validation | Draft > publish revisions, locked once published, revert | Rules, safe rollouts, env off = `null`; SDK default value; prerequisites act as kill switches | Generic A/B only |
| Braintrust | Prompt = model + params + messages + tools (pushed functions) | Every change a version; environments (`production`) assignable via CLI | No targeting; environment reassignment; cached fallback, `defaults` | `Eval(data, task, scores)`, experiments immutable, online scoring |
| Langfuse | Prompt + JSON `config` (holds `tools`, `tool_choice`, model params); prompt references | Numbered versions; labels `production`/`latest`/custom, protected labels | Label reassignment; SDK cache + `fallback`; no percentage | A/B via two labels chosen in app; dataset experiments |

## What the field agrees on

1. **The bundle is prompt + tools + model, declared once by name.** Every agent framework that has a named
   unit puts instructions and the tool list in the same object or file (Claude Code subagent, Copilot agent
   file, OpenAI `Agent`, ADK `LlmAgent`, `ToolLoopAgent`, Deep Agents subagent). Rules-only systems (Cursor)
   are the exception and have no tool story.
2. **Tool enable/disable is a per-request predicate over a fixed registry, not a rebuilt tool set.** OpenAI
   `is_enabled(context)`, ADK `tool_filter(tool, context)`, AI SDK `activeTools` + `prepareStep`,
   LangChain `request.override(tools=...)` with "all available tools registered upfront", Claude Code deny
   rules that remove the tool from context. Hidden tools are gone from the model's view, not merely refused.
3. **Versioning is git, with the file as the artifact.** Copilot versions by commit SHA; Claude Code says
   check the file in; OpenAI is retiring server-side prompt objects in favour of "git history, PR review,
   release tags, and feature flags". Only the observability/flag platforms version prompts server-side, and
   there the unit is prompt + model + (sometimes) tool schemas, never tool implementations.
4. **Rollout and kill-switch come from a flag or policy layer outside the agent definition.** Flag-native
   platforms (LaunchDarkly, Statsig, PostHog, GrowthBook) give percentage + targeting + instant off;
   agent frameworks give a predicate hook and leave the flag source to you. Policy layers (Claude managed
   settings, Codex `requirements.toml`, Copilot/Cursor enterprise) pin bundles on or off above user config.
5. **Nobody tests combinations.** Evals run one agent definition against a dataset; the only explicit
   anti-explosion mechanism is Statsig Layers (mutually exclusive bucket ownership). Claude's plugin eval
   scores WITH versus W/OUT one bundle, which is the closest thing to a pairwise check.

## Synthesis for this codebase

### Loadout shape: layered, a base profile plus independent capabilities

Three candidate shapes, judged against the two lists we have:

- **Named profiles only** (one profile per combination): matches how Claude Code and Copilot name agents,
  but our combinations are products of independent org settings (`enableContentTools`, `enableDocuments`,
  `enableGenerateDataApp`, `enableAiWriteback`, ...). Profiles multiply.
- **Composable capability sets only** (every flag a set, union them): matches `activeTools`/`tool_filter`,
  but leaves the query path as "whichever of runQuery / runSql / composer survived the unions", which is the
  ambiguity the composer-only agent exists to remove. The query path is not additive.
- **Layered** (recommended): a `base` chosen by a small enum, then additive `capabilities`. This is what the
  field does implicitly: Claude Code `tools: {preset}` + `systemPrompt: {preset, append}`; Copilot agent
  file + instruction files applied by glob; ADK agent + toolsets. It keeps the few mutually exclusive
  decisions in the base and the many independent ones as capabilities.

Concretely, one pure function:

```ts
type AgentBase = 'classic' | 'composer' | 'deep_research_worker' | 'deep_research_coordinator' | 'no_data_access';
type AgentCapability = 'contentTools' | 'documents' | 'scheduling' | 'generateDataApp' | 'aiWriteback'
  | 'codingAgent' | 'repoDiscovery' | 'previewDeploySetup' | 'editProjectContext' | 'readAttachments'
  | 'selfImprovement' | 'memory' | 'userContext';

type Loadout = {
  base: AgentBase;
  capabilities: ReadonlySet<AgentCapability>;
  toolNames: ReadonlySet<string>;       // declared, not inferred from the built ToolSet
  promptSections: readonly string[];    // section ids in render order
};

const resolveLoadout = (args: AiAgentArgs): Loadout => ...
```

`getAgentTools` and `getCapabilitySections` then become lookups over `loadout.toolNames` and
`loadout.promptSections`. Tools stay registered upfront (the field's rule) and the loadout filters; a tool
never built because of a missing dependency is a bug the snapshot catches.

### Which flags become part of a loadout, which stay plain conditionals

Into the **base** (mutually exclusive, change what the agent *is*):

- `enableComposerQueries` (from `ComposeSqlRunner` + multi-source + data access): `composer` base. Drops
  `runQuery`, `generateVisualization`, `runSql`; adds `runComposerQueries`; one positive query section.
- `enableDataAccess` false: `no_data_access` base (already a separate prompt file,
  `systemV2DataAccessDisabled.ts`).
- `responseExecution.mode === 'deep_research'` worker/coordinator: already fixed tool-name sets
  (`DEEP_RESEARCH_*_TOOL_NAMES` in `agentV2.ts`); they are loadouts today in all but name.

Into **capabilities** (independent, additive, each owns a tool subset and at most one prompt section):

- `enableContentTools`, `enableDocuments`, scheduling tools, `enableGenerateDataApp`, `enableAiWriteback`,
  `enableCodingAgent`, `enableRepoDiscovery`, `enablePreviewDeploySetup`, `enableEditProjectContext`,
  `enableReadAttachments`, `enableSelfImprovement`, memory, user context.

Stay **plain conditionals** inside a tool or a section (they change wording or a schema branch, not
membership):

- `enableFilterExpressions` (schema variant of existing tools; already snapshot-tested per variant).
- `enableComposerPythonNodes` (node kinds inside `runComposerQueries`).
- `enableDataAnswerFastResponse`, `enableFastMetadata`, `enableDocumentNudges`,
  `enableDocumentCustomCharts`, `slackLinksOnly`, `enableChartExport`.

Rule of thumb from the field: a flag earns a place in the loadout when it changes which tools exist or which
prompt sections render. A flag that only changes text or a schema branch stays where it is.

### Testing without the explosion

Follow Statsig's exclusivity and Claude's WITH/W-OUT, not a full matrix:

1. **One contract snapshot per base**, capabilities empty: tool names + prompt section ids + rendered prompt.
   Five bases, five snapshots. The composer-only agent's completion check is "`composer` base snapshot
   exists and `classic` base snapshot is byte-identical to today".
2. **One WITH snapshot per capability on the `classic` base** (tool names and section ids only, not the full
   prompt), plus a test that every capability's tool subset is disjoint from every other's. Disjointness is
   what makes pairwise tests unnecessary: if adding capability X never removes or rewrites what Y added,
   X+Y is the union by construction.
3. **Each base × the full capability set** as one more snapshot (the existing "flag-off + every
   capability" fixture generalised). Catches a base that forgets to carry a capability.
4. **Plain conditionals keep their existing per-variant tests** inside the tool or section they live in
   (`agentToolContracts.snapshot.test.ts` already does this for `enableFilterExpressions`).

That is 5 + 13 + 5 snapshots instead of 2^18. The `Loadout` type also lets the agent record which loadout
ran on each thread (as `buildDeepResearchExecutionContextSnapshot` already records `enabledToolNames`), so
a rollout of the `composer` base is observable per org without reading flag state after the fact.

### Rollout

Nothing new: the base is selected from existing `FeatureFlags` through `FeatureFlagService.get`
(`docs/feature-flags.md`), so Console overrides and self-hosted ENV lists remain the kill-switch. The field's
one relevant warning is LaunchDarkly's: current AI SDKs throw when a config is off rather than falling back,
so the loadout resolver must always produce a base (`classic` is the fallback), never throw.

## Not verified

- LangSmith SDK `include_model` push flag; Deep Agents testing guidance.
- Vertex AI Agent Engine version/rollback.
- Codex `[profiles.<name>]` inline tables (only separate profile files documented).
- Cursor legacy Custom Modes removal (forum only); exact Copilot tool-set filename.
- Statsig holdouts page; LaunchDarkly compare-variation-versions page content.
- OpenAI Responses API `prompt` request-param text (deprecation verified, parameter doc not fetched).
