# Agent loadouts

What an AI agent run can do: its tools and the system prompt sections that explain them. Terms: `docs/ai-agent/CONTEXT.md`. Decision: `docs/composer-queries/adr/0002-agent-loadouts-are-one-base-plus-additive-add-ons.md`. Spec: branch `docs/zap-1275-loadouts`.

- **Loadout**: the resolved bundle for one run, from `resolveLoadout`; `getAgentTools` builds exactly `loadout.toolNames`, the prompt renders exactly `loadout.promptSections` and lists the built-in skills in `loadout.skills`.
- **Base**: the one exclusive core (`bases.ts`) that owns the query path and lists the add-ons it accepts.
- **Add-on**: an independent unit (`addOns.ts`) with a condition, disjoint tools, at most one section and the built-in skills that explain its tools.
- **Overlay**: a per-turn narrowing (intent gate, `toolAllowlist`) that only removes loadout tools.

## Observability

A turn's loadout is on its trace: span attributes `ai.agent.loadout.{base,add_ons,skills,tool_count}` and `loadoutBase`/`loadoutAddOns` on AI SDK `ai.*` spans (`telemetry.ts`). Logs: event `ai_agent.loadout_resolved`. Rows: `ai_prompt.loadout_base`, written from `prepareAgentTurn`, exposed as `loadout` on assistant messages.

## Adding a tool

1. Add the name to `AGENT_TOOL_NAMES` and its builder to `toolBuilders` in `agents/agentV2.ts`.
2. Choose its owner: the base when it is part of the query path, otherwise an add-on. Add it to an existing add-on with the same condition, or a new add-on with a one-line `description`. A base that needs an add-on's tool accepts that add-on; it never lists the tool.
3. Run `pnpm -F backend test src/ee/services/ai/loadout` and commit the updated snapshots in `__snapshots__/`; they are the contract reviewers read.

## Adding a built-in skill

1. Add the skill directory under `skills/builtInSkills/` with `agent` in its `availability`, and its name to `BUILT_IN_SKILL_NAMES` in `types.ts`.
2. Declare it in `skills` on the add-on that owns the tools it explains; that add-on then brings `loadSkill` through the `skills` add-on. Agent runs list and load only `loadout.skills` plus the agent's custom skills.
3. Run `pnpm -F backend test src/ee/services/ai/loadout` and commit the updated snapshots.

## Flags

A flag joins the loadout only when it changes which tools exist or which sections render. A flag that changes wording or a schema branch stays a plain boolean on `AiAgentArgs`, read where it is used.
