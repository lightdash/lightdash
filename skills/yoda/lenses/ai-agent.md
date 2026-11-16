# AI Agent

## Review

- **Skip when:** the data app runtime (Data apps), frontend code alone (UI: rendering agent output, approval controls, starting a run; not when the frontend sends the agent new context or options), or what only outside clients see (MCP).
- **Worst case:** the in-app agent quietly answers worse, for every user of the changed prompt or tool; you can't see it by reading code.
- **Evidence:** read tool code.
  Identify affected agents from changed base snapshot names (`loadout/__snapshots__/bases*/*.prompt.txt`, names only).
- **evidence beyond code:** prompt, tool-description and model changes show new behaviour through evals, recorded examples or a manual conversation.
- **reach intended:** every agent whose prompt or tools changed is meant to change; other behaviour sharing the changed text or tool still works (one example each).
- **copies agree:** the same rule in a prompt, a built-in skill and a tool description says the same thing.
  A copy left contradicting the others is Fix.
- **prompt and tool agree:** prompts use tool names, arguments, values and results available to that agent; gate prompts with the same flags as their tools. Mismatch is Fix.
- **text code matches:** a prompt line that code searches for (offer lines, markers) keeps the old wording recognised, so threads written before the change still match. Dropping it is Fix.
- **permissions:** tools act with the user's abilities, never wider, and each tool is offered only on the surfaces meant to have it.
- **cost bounded:** no unbounded loop or fan-out of model calls, results sent back into the model's context are size-bounded, and credit or usage limits are checked before the call.

## Impact

- **breaking:** a relied-on tool disappears or refuses a supported request.
- **notable:** new tool, prompt rule or model.
- **minor:** wording leaving agent behaviour unchanged.

## Diff

```ts
type AiAgentDiff = Diff & {
    kind: string;  // prompt (any wording the model reads), tool or model
    agent: string;  // classic, composer, deep-research, semantic-studio, data-app generator, a side model call by its job (`review classifier`), or all; all when no base snapshot changed to tell
};
```

- **Name:** the prompt piece in a few words, or the tool/skill name.
- **Note:** what the agent now does.
- **Granularity:** one diff per prompt piece, tool or model, and per agent it reaches; each copy of a rule gets its own diff.
- When an add-on or setting matters, the note says so (`with SQL on: …`).

```json
{ "lens": "AI Agent", "change": "modified", "impact": "breaking", "name": "visualize", "kind": "tool", "agent": "composer", "note": "refuses a bar, line, area or scatter chart with no category axis" }
```
