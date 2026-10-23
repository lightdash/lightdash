# AI copilot availability

AI copilot (AI agents, Ask AI, agent memory, and the MCP server when
`MCP_ENABLED` isn't set) isn't a feature flag. An organization has it when all
three of these hold:

1. **A valid Enterprise licence.** Set `LIGHTDASH_LICENSE_KEY`.
2. **AI is enabled on the instance.** Set `AI_COPILOT_ENABLED=true`.
3. **A model is configured for the organization.** The default provider of the
   organization's resolved AI config has credentials.

`isAiCopilotAvailable` in `packages/backend/src/config/aiCopilotAvailability.ts`
is the one rule. `OrgAiCopilotConfigResolver.isCopilotAvailable` applies it to
an organization. Every backend gate goes through that method, and the frontend
reads the result from `/api/v1/health` (`ai.isCopilotAvailable`) and from the
organization AI settings (`isCopilotEnabled`).

## What counts as a configured model

The resolved config is the instance config with the organization's own provider
keys overlaid (`overlayOrgProviderApiKeys`). A model is configured when that
config's `defaultProvider` has an entry in `providers`:

- **Instance provider.** `AI_DEFAULT_PROVIDER` (default `openai`) names a
  provider whose credentials are set, for example `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AZURE_AI_API_KEY`,
  `OPENROUTER_API_KEY`, `GOOGLE_VERTEX_API_KEY` or `GOOGLE_VERTEX_PROJECT`, or
  Bedrock credentials. A key for a provider that isn't the default doesn't
  configure a model on its own.
- **Organization keys.** With custom AI providers enabled for the organization,
  an organization Bedrock key configures a model even when the instance has no
  provider. An organization key for Anthropic, Google, or OpenAI replaces the
  instance key of a provider the instance already runs, and can make that
  provider the default.

Without a configured model, the AI copilot UI stays hidden. No setting shows an
empty AI surface.

## Why `AI_COPILOT_ENABLED` stays

Other features read the same provider keys, each behind its own gate:

- Data apps run Claude Code on `ANTHROPIC_API_KEY` or Codex on
  `OPENAI_API_KEY`.
- AI writeback runs Claude Code on `ANTHROPIC_API_KEY`.
- Ambient AI uses `ANTHROPIC_API_KEY` directly.

Because `AI_DEFAULT_PROVIDER` defaults to `openai`, an install that sets
`OPENAI_API_KEY` only for Codex data apps would have a configured model. Without
`AI_COPILOT_ENABLED`, copilot would turn on for that install. The variable is the
instance owner's consent to run AI copilot on the keys they configured.

## Removed

- The `ai-copilot` feature flag and its per-organization overrides.
- `AI_COPILOT_REQUIRES_FEATURE_FLAG`.
- The AI free trial for organizations created after 2025-10-13. It only applied
  where the flag was off for an organization, so it has no meaning without the
  flag.
