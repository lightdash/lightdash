# MCP tool-definition token accounting

Date: 2026-08-03

Repositories were inspected at these pinned revisions:

- `anomalyco/opencode`: [`1882c33827cf0ce5c948b69ab5a87ed8f6790cf8`](https://github.com/anomalyco/opencode/tree/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8)
- `earendil-works/pi`: [`f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee`](https://github.com/earendil-works/pi/tree/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee)
- `openai/codex`: [`bb5054fe47abe73ecbbd454751066a28c89f4bb9`](https://github.com/openai/codex/tree/bb5054fe47abe73ecbbd454751066a28c89f4bb9)

## Conclusion

All three track provider-reported request usage at whole-request level. None exposes provider-measured usage attributed to one tool or MCP server. Pi has the closest implementation precedent for an estimate: serialize all tool definitions, then use `ceil(characters / 4)`. OpenCode also uses `ceil(characters / 4)` for an approximate context breakdown, while Codex uses `ceil(UTF-8 bytes / 4)` and explicitly calls that heuristic coarse rather than tokenizer-accurate.

The proposed Lightdash UI should therefore treat these values as **definition token estimates**, not measured usage. Per-server totals should sum its enabled tool estimates. Because Lightdash lazy-loads MCP definitions, the configuration UI should say **up to N tokens when loaded** or **N enabled definition tokens**, with nearby help that explains the approximation—not **N tokens in context**.

| Repository | Provider usage | Local estimate | Per-tool/MCP attribution | UI |
| --- | --- | --- | --- | --- |
| OpenCode | Input, output, cache and reasoning from provider events | `ceil(chars / 4)` for context categories | No; definitions fall into aggregate “Other” | Aggregate context and approximate category breakdown |
| Pi | Input, output, cache, reasoning and cost from provider responses | `ceil(chars / 4)` over serialized tool array | Aggregate tool-definition estimate only | Aggregate session/context usage |
| Codex | Input, output, cache and reasoning from Responses events | `ceil(UTF-8 bytes / 4)` for local history/output heuristics | No | Aggregate session/context usage |

## OpenCode

OpenCode's normalized usage contract is explicitly provider-reported and distinguishes inclusive input/output totals from non-cached input, cache reads, cache writes and reasoning. It also retains the raw provider payload for auditability ([usage contract](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/llm/src/schema/events.ts#L7-L59)). Its OpenAI adapter maps `prompt_tokens`, cached tokens, completion tokens and reasoning tokens directly from the provider event ([OpenAI mapper](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/llm/src/protocols/openai-chat.ts#L386-L404)). These numbers describe the complete request, not individual definitions.

MCP tools are discovered, normalized into dynamic tools with their description and input schema, transformed for the selected provider, and added to the session tool set ([MCP conversion](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/opencode/src/mcp/catalog.ts#L38-L53), [provider schema transformation](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/opencode/src/session/tools.ts#L388-L398)). There is no separate metering event at that boundary.

The UI builds an approximate context breakdown with `Math.ceil(chars / 4)` and assigns the residual between locally estimated categories and provider input tokens to `other` ([breakdown estimator](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/app/src/components/session/session-context-breakdown.ts#L12-L14), [residual calculation](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/app/src/components/session/session-context-breakdown.ts#L111-L131)). Its own UI copy says “Other” includes tool definitions and overhead ([copy](https://github.com/anomalyco/opencode/blob/1882c33827cf0ce5c948b69ab5a87ed8f6790cf8/packages/app/src/i18n/en.ts#L459-L465)). OpenCode therefore exposes tool definitions only as unattributed aggregate overhead, not as per-tool estimates.

## Pi

Pi records provider-reported input, output, cache-read, cache-write, reasoning, total tokens and cost ([usage type](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/types.ts#L368-L388)). Its OpenAI Responses adapter separates cached/cache-write input from fresh input and copies output, reasoning and total usage from the response before calculating cost ([Responses mapping](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/api/openai-responses-shared.ts#L541-L558)).

Pi also has a local context estimator. It defines four characters per token, JSON-serializes the complete tool array, and includes that estimate alongside the system prompt and messages ([estimator constant and text calculation](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/utils/estimate.ts#L14-L42), [tool serialization and context calculation](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/utils/estimate.ts#L105-L142)). After a provider usage block, it estimates only definitions introduced later in the transcript, avoiding double-counting definitions already covered by provider usage ([incremental definitions](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/utils/estimate.ts#L117-L131)). The result is used to reserve output space against the model context window ([simple options](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/api/simple-options.ts#L5-L17)).

Pi can split tools into immediate and transcript-loaded definitions ([deferred-tool split](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/ai/src/utils/deferred-tools.ts#L7-L38)), but the estimator returns only the combined serialized-tool cost. Its footer displays aggregate input, output, cache and context statistics ([footer](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/coding-agent/src/modes/interactive/components/footer.ts#L84-L108), [rendered metrics](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/coding-agent/src/modes/interactive/components/footer.ts#L128-L161)). Core Pi deliberately has no built-in MCP; MCP can be added by an extension ([README](https://github.com/earendil-works/pi/blob/f0deb8dd8e9611e89b5bc4145ca92c03ae6ed4ee/packages/coding-agent/README.md#L491-L497)). It consequently has no native per-MCP server grouping.

## Codex

Codex maps Responses API completion usage into input, cached input, cache-write input, output, reasoning output and total tokens ([Responses event mapping](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/codex-api/src/sse/responses.rs#L112-L149)). Its protocol keeps both latest-turn and accumulated session usage ([protocol types and accumulation](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/protocol/src/protocol.rs#L2064-L2125)). The status UI renders aggregate total, input, output and context-window usage ([status calculation and display](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/status/card.rs#L326-L342), [status spans](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/status/card.rs#L376-L407)).

Codex's local approximation is `ceil(UTF-8 bytes / 4)` ([string utility](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/utils/string/src/truncate.rs#L4-L5), [token calculation](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/utils/string/src/truncate.rs#L71-L84)). The history estimator explicitly describes this as a coarse, non-tokenizer-accurate lower bound and applies it to base instructions plus history items ([history estimator](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/core/src/context_manager/history.rs#L163-L188)). Tool specifications are a separate field on the model prompt ([prompt structure](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/core/src/client_common.rs#L16-L32)), so that history estimate is not a per-tool estimate.

When tool search is enabled, Codex registers MCP tools as deferred instead of including them in the initial model-visible tool list ([MCP exposure](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/core/src/mcp_tool_exposure.rs#L18-L46)). Deferred means registered for later discovery but omitted initially ([exposure contract](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tools/src/tool_executor.rs#L13-L35)); discovered specifications are returned as client `tool_search_output` context items ([tool-search output](https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/core/src/tools/context.rs#L151-L189)). This is the same semantic reason Lightdash must distinguish potential enabled-definition cost from the definitions active in a specific thread.

## Recommended Lightdash implementation

### Estimate contract

Use one deterministic pure function over the definition sent to the model:

```ts
const serializedDefinition = JSON.stringify({
    name: canonicalRuntimeName,
    description: description ?? '',
    inputSchema,
});
const estimate = Math.ceil(
    new TextEncoder().encode(serializedDefinition).byteLength / 4,
);
```

Four UTF-8 bytes per token follows Codex and avoids treating multibyte text as cheaper than ASCII; for typical ASCII-heavy schemas it is equivalent to the two TypeScript precedents. `ceil`, rather than `round`, matches all three inspected estimators. This is intentionally model-agnostic. Provider-specific tokenizers and provider-specific tool wrappers can produce different actual counts, so the UI must explain that the values are approximate.

Use Lightdash's runtime namespaced name (`mcp_<sanitized server>__<sanitized tool>`) if available. Estimating with only the raw MCP `toolName` slightly undercounts what the model receives. Keep the serializer near the runtime/common contract if practical so the UI does not drift from the tool shape. Compute dynamically from stored definitions; a database column is unnecessary and can become stale after MCP refreshes.

### Aggregation and UI semantics

- Tool row: `640` under a token column with tooltip “Approximate size of this tool definition.”
- Server permissions row: sum enabled tools, displayed as `8.2k tokens`.
- Page header: sum enabled tools across attached servers, displayed as “Tokens used by MCPs 33.9k,” with a help tooltip.
- Warning threshold: presentation-only, based on the enabled-definition total.
- Disabled tools still show their row estimate but do not contribute to server/page totals.
- Server totals are sums of tool definitions, not separately metered server overhead.
- Tooltip: explain that tool definitions share the model's working space with the question and answer, larger sets may increase latency/cost, and lazy loading usually makes actual usage lower.

Avoid “Tool definitions in context” on this configuration screen. Lightdash's `loadMcpTools` gating makes the active set thread- and step-dependent; the settings page knows the potential enabled set, not a live thread's loaded set. A future thread UI can show “currently loaded” by applying the same estimate to the active tool names reconstructed from message history.

### Validation

1. Pure tests: stable serialization, empty/Unicode descriptions, nested schemas, enabled-only aggregation and compact formatting.
2. Runtime fixture: compare the estimated object with the canonical names and schemas passed into the AI SDK.
3. Provider A/B: send the same prompt/model once without a definition and once with one definition; compare provider-reported input tokens. Treat the delta as validation evidence, not a permanent exact attribution mechanism, because request wrappers, caching and tokenizer changes can affect it.

## Final distinction

- **Measured usage:** provider-reported tokens for a complete model request; authoritative for billing/context, but not attributable to a single definition.
- **Definition estimate:** deterministic size estimate for one serialized tool definition; appropriate for per-tool and per-server configuration guidance.
- **Loaded-definition estimate:** sum of estimates for tools active in a particular thread step; only available when runtime/message state is known.
