# Vertex AI for dedicated instances

Select Vertex with `AI_DEFAULT_PROVIDER=vertex`. Configuration belongs to the
instance environment; Vertex has no model presets or organization BYOK setting.
Restart the backend and workers after changing the environment.

## Application Default Credentials

```dotenv
AI_COPILOT_ENABLED=true
AI_DEFAULT_PROVIDER=vertex
GOOGLE_VERTEX_PROJECT=your-gcp-project
GOOGLE_VERTEX_LOCATION=global
GOOGLE_VERTEX_MODEL_NAME=gemini-3.8-flash
```

For local development, run `gcloud auth application-default login` and
`gcloud auth application-default set-quota-project your-gcp-project`.
The Node SDK discovers those credentials automatically. The runtime identity
needs model invocation permissions in the project, and the Vertex AI API must
be enabled. In Google Cloud, use the workload's attached identity. The standard
`GOOGLE_APPLICATION_CREDENTIALS` variable is also supported by Google's library.
Containers need credentials available inside the container.

Both authentication methods use Vertex's `generateContent` API. Lightdash sends
the conversation history on each request. Vertex Interactions is not used.
Tool declarations use `parametersJsonSchema`, preserving the original JSON
Schema. A Vertex-specific transport adapter avoids the SDK's OpenAPI conversion,
which can produce invalid `any_of` siblings for nullable arrays such as
`generateVisualization.chartConfig.groupBy`. This applies to both streaming and
non-streaming requests and both authentication methods.

`GOOGLE_VERTEX_PROJECT` enables the ADC provider; merely having credentials on
the machine does not enable it. `GOOGLE_VERTEX_LOCATION` defaults to `global`;
choose a region that supports the configured model and your deployment's data
location requirements.

## API key (Vertex Express Mode)

```dotenv
AI_COPILOT_ENABLED=true
AI_DEFAULT_PROVIDER=vertex
GOOGLE_VERTEX_API_KEY=your-vertex-express-api-key
GOOGLE_VERTEX_MODEL_NAME=gemini-3.8-flash
```

An API key selects the SDK's Vertex Express Mode and takes precedence over ADC.
Express Mode does not use the project or location settings. Use a Vertex Express
Mode key; `GEMINI_API_KEY` configures the separate Gemini Developer API provider.
Unset `GOOGLE_VERTEX_API_KEY` to use ADC.

## Models and capabilities

- `GOOGLE_VERTEX_MODEL_NAME` is passed directly to Vertex, without preset
  validation. It defaults to `gemini-3.8-flash`. Change it to test another
  supported Gemini model or a compatible Vertex model resource ID.
- `GOOGLE_VERTEX_FAST_MODEL_NAME` optionally selects a model for lightweight
  tasks. It defaults to the primary Vertex model. Existing routing still prefers
  an eligible configured Anthropic key for ambient tasks; configure only Vertex
  for a Vertex-only instance.
- `GOOGLE_VERTEX_SUPPORTS_STREAMING=false` uses non-streaming requests with
  simulated output streaming. The default is `true`.
- Sampling and thinking use the model's defaults. There is no preset-driven
  reasoning toggle or context-window compaction for Vertex.
- This provider covers Gemini text, structured output, and tool calls. It does
  not configure embeddings or Anthropic models hosted on Vertex. If embeddings
  are enabled, retain a supported embedding provider separately.
- Usage is attributed to `vertex`, with `self-managed` key ownership by default.
  Existing AI usage tracking settings still control collection and exposure.

Provider reference: [Vercel AI SDK Google Vertex](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex).
