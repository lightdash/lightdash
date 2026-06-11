# AI Agent: Non-Streaming LLM Gateways (`supportsStreaming`)

This document describes the per-provider `supportsStreaming` capability (PROD-8155,
[#23948](https://github.com/lightdash/lightdash/issues/23948)): how to run the AI agent against an
OpenAI-compatible LLM gateway that does not support streaming (SSE) completions.

---

## The two streaming layers

"Streaming" in the AI agent means two independent things:

1. **Backend ↔ provider**: `streamText` issues a *streaming completion request* to the model
   endpoint. This is the part a non-streaming gateway can't serve.
2. **Frontend ↔ backend**: the `/stream` SSE endpoint that delivers tokens to the browser. This is
   our own infrastructure and works regardless of how the provider call is made.

`supportsStreaming` only changes layer 1. The browser-facing SSE endpoint, the chat UI, tool cards,
and `smoothStream` word-chunking are unchanged.

## Configuration

Streaming support is a property of the gateway/endpoint a provider points at — the same place you
configure `*_BASE_URL` and `*_CUSTOM_HEADERS` (see PR
[#23448](https://github.com/lightdash/lightdash/pull/23448), which established the per-provider
capability pattern with `customHeaders`). Each provider has an opt-out env var, **default on**:

| Provider | Env var |
|---|---|
| OpenAI | `OPENAI_SUPPORTS_STREAMING` |
| Azure OpenAI | `AZURE_AI_SUPPORTS_STREAMING` |
| Anthropic | `ANTHROPIC_SUPPORTS_STREAMING` |
| OpenRouter | `OPENROUTER_SUPPORTS_STREAMING` |
| Bedrock | `BEDROCK_SUPPORTS_STREAMING` |

Streaming is disabled only when the var is the literal `false`. Example for a gateway routed
through the OpenAI provider:

```bash
AI_COPILOT_ENABLED=true
AI_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://internal-gateway.example.com/v1
OPENAI_SUPPORTS_STREAMING=false
```

The capability lives on the provider config objects in
`packages/backend/src/config/aiConfigSchema.ts` and is parsed in `getAiConfig`
(`packages/backend/src/config/parseConfig.ts`).

## Mechanism

When a provider has `supportsStreaming: false`, `getModel`
(`packages/backend/src/ee/services/ai/models/index.ts`) wraps the resolved model with the AI SDK's
[`simulateStreamingMiddleware`](https://ai-sdk.dev/docs/reference/ai-sdk-core/simulate-streaming-middleware)
via `wrapLanguageModel`. The middleware implements only `wrapStream`: it calls `doGenerate()` once —
a single non-streaming request — and replays the complete result as a simulated stream (text,
reasoning, and tool-call parts).

Because the capability is absorbed into the model object at resolution time, every consumer is
covered without call-site branches:

- Both `streamText` sites (the main agent response in `agentV2.ts` and the discoverFields subagent)
  share the resolved model. Each agent step becomes one `doGenerate` request; multi-step tool loops
  work unchanged.
- `generateText` / `generateObject` consumers (Slack replies, titles, tooltips, evals) pass through
  identically — the middleware doesn't touch `doGenerate`.

The provider is chosen per request (`prompt.modelConfig.modelProvider`), which is why the wrap
happens in `getModel` rather than at service registration: a request on a streaming provider gets
the bare model, one on the gateway gets the wrapped model.

## Verification

A unit test (`packages/backend/src/ee/services/ai/models/index.test.ts`) runs `streamText` with a
tool through the real `toUIMessageStream → readUIMessageStream` path against a mock model whose
`doStream` throws. With the wrap applied: `doStream` is never called, each agent step is one
`doGenerate`, the multi-step tool loop completes, and the UI message stream contains the expected
tool and text parts.

## Caveat: proxy idle timeouts on-prem

With streaming, bytes flow continuously and keep proxy connections alive. With
`supportsStreaming=false`, bytes still flow *between* agent steps, but within a single step nothing
is sent until that `doGenerate` returns. A long final generation can approach reverse-proxy idle
timeouts (e.g. nginx `proxy_read_timeout`). Deployments using this flag should set proxy
read/idle timeouts comfortably above the expected single-completion time.
