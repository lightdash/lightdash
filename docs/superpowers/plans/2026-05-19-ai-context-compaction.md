# AI Context Compaction — Implementation Plan

## Executive summary

Add feature-flagged context compaction for AI agent threads so long conversations do not exceed model context windows.

The trigger runs when a new streamed prompt starts. Before building model history, check the previous prompt's recorded token usage against the current model's context window:

- `shouldCompact = lastPrompt.tokenUsage.totalTokens > contextWindowTokens - reserveTokens`
- `reserveTokens = 16384`

If compaction is needed:

- summarize thread history up to the previous prompt
- persist that summary in a dedicated `ai_thread_compaction` table
- rebuild model history from that summary plus raw prompts after the compaction point

The compaction summary format and message summarization format should be based on the pi compaction doc:

- [pi compaction doc](https://raw.githubusercontent.com/earendil-works/pi/refs/heads/main/packages/coding-agent/docs/compaction.md)

If compaction is not needed:

- still rebuild history starting from the latest compaction point, if one exists

Compaction is a system event, not a user/assistant prompt. Do not persist it as `ai_prompt`. Persist it separately and render it in the UI as a divider/event.

## Key decisions

- Trigger on stream request path, before history assembly
- Scope V1 to streamed web-app threads only
- Use model-specific hardcoded context windows from `presets.ts`
- Use hardcoded `reserveTokens = 16384`
- Store per-prompt token usage in `ai_prompt.token_usage jsonb`
- Use `totalTokens` as the V1 trigger signal
- Azure and OpenRouter: unsupported for V1 compaction
- No `keepRecentTokens` budget slicing in V1
- No turn-splitting in V1
- Compact at most once per incoming request

## Data model

### 1. `ai_prompt`

Add column:

- `token_usage jsonb null`

V1 shape:

```json
{
  "totalTokens": 12345
}
```

This is written on prompt completion from AI SDK `onFinish`.

### 2. `ai_thread_compaction`

Create new table:

- `ai_thread_compaction_uuid`
- `ai_thread_uuid` FK
- `compacted_through_ai_prompt_uuid` FK to the last prompt included in the summary
- `triggering_ai_prompt_uuid` FK to the new prompt that caused compaction
- `summary text not null`
- `created_at`

Semantics:

- everything up to and including `compacted_through_ai_prompt_uuid` is represented by `summary`
- raw history after that prompt remains intact
- the divider belongs between `compacted_through_ai_prompt_uuid` and `triggering_ai_prompt_uuid`

## Backend implementation plan

### 1. Model metadata

In [`presets.ts`](/Users/giorgi/develop/lightdash_2/packages/backend/src/ee/services/ai/models/presets.ts), add `contextWindowTokens` to each supported preset.

V1 only needs preset-backed providers:

- OpenAI
- Anthropic
- Bedrock

Add a small resolver in model code that returns:

- `contextWindowTokens`
- `supportsCompaction`

For Azure/OpenRouter return `supportsCompaction = false`.

### 2. Persist token usage

In [`agentV2.ts`](/Users/giorgi/develop/lightdash_2/packages/backend/src/ee/services/ai/agents/agentV2.ts) `onFinish`, persist:

- `token_usage.totalTokens = usage.totalTokens ?? 0`

Thread this through [`AiAgentService.ts`](/Users/giorgi/develop/lightdash_2/packages/backend/src/ee/services/AiAgentService/AiAgentService.ts) into [`AiAgentModel.ts`](/Users/giorgi/develop/lightdash_2/packages/backend/src/ee/models/AiAgentModel.ts) via a dedicated update method.

### 3. Pre-stream compaction check

Add a helper in `AiAgentService` that runs before chat history is built:

1. load thread messages
2. get the latest non-compaction prompt before the current request
3. resolve model context window from the current prompt model config
4. if compaction unsupported, skip
5. if `lastPrompt.totalTokens <= contextWindowTokens - reserveTokens`, skip
6. otherwise run compaction once

Call this from `prepareAgentThreadResponse`, before `getChatHistoryFromThreadMessages`.

### 4. Compaction summary generation

Implement a compaction summarizer that serializes the thread up to the target prompt into a compact, model-readable transcript:

- user asks and intent shifts
- key assistant conclusions
- persisted tool calls/results that materially matter
- artifacts created or referenced
- unresolved questions / pending follow-ups
- pinned context that still matters

Exclude:

- reasoning traces
- verbose intermediate tool chatter
- UI-only stream state

Use the pi compaction doc as the starting point for both:

- overall summary format
- per-message summarization format

The compacter should be implemented as a dedicated agent-style generator, similar to [`titleGenerator.ts`](/Users/giorgi/develop/lightdash_2/packages/backend/src/ee/services/ai/agents/titleGenerator.ts), not embedded inline in the main agent runtime.

Use a compact dedicated prompt and a fast model where possible.

### 5. Persist compaction

After summary generation, insert one `ai_thread_compaction` row with:

- `compacted_through_ai_prompt_uuid = lastPrompt.ai_prompt_uuid`
- `triggering_ai_prompt_uuid = currentPrompt.ai_prompt_uuid`
- `summary`

### 6. Rebuild history from compaction point

Update history-building logic so it:

- finds the latest compaction relevant to the thread
- prepends one synthetic summary message from that compaction
- includes only raw prompts/tool calls/results after `compacted_through_ai_prompt_uuid`

Raw history before the compaction point stays in DB, but is excluded from model input.

## Frontend implementation plan

### 1. Streaming event

Emit a custom stream chunk when compaction starts, similar to MCP unavailable notices.

Example event:

- `data-compaction-started`

The frontend stream slice should surface a transient “Compacting conversation” state while the summary is being generated.

### 2. Persisted thread rendering

Extend thread payloads to include compaction rows for the thread.

Render each compaction as:

- a vertical divider / timeline marker
- optional small label like `Conversation compacted`

Placement:

- after `compactedThroughPromptUuid`
- before the next prompt in the visible thread

### 3. No fake assistant bubble

Do not render compaction as a normal assistant message or tool call row. It is a timeline event.

## Testing plan

- avoid excessive mocking, test behavior and pure functions primarily
- compaction logic should be layered well for it to be tested properly

## Deferred from V1

- token-budgeted `keepRecentTokens`
- turn-splitting / partial-turn compaction
- compaction for Azure/OpenRouter
- repeated compaction loops within one request
- compaction for non-stream `generate` path unless needed later
