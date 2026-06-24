import { MissingConfigError } from '@lightdash/common';

/**
 * The subset of the Bedrock provider config the `claude` CLI needs: a region
 * plus either a bearer token (API key) or static IAM credentials. This is
 * structurally a subset of `lightdashConfig.ai.copilot.providers.bedrock`, so
 * that config can be passed straight through without remapping.
 */
export type ClaudeCodeBedrockConfig =
    | { region: string; apiKey: string }
    | {
          region: string;
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken?: string;
      }
    | { region: string; useDefaultCredentials: true };

/**
 * The slice of the AI copilot config the Claude CLI env depends on: the active
 * provider switch (`AI_DEFAULT_PROVIDER`) and the Bedrock credentials.
 * Structurally a subset of `lightdashConfig.ai.copilot`, so it can be passed
 * straight through.
 */
export type ClaudeCodeProviderConfig = {
    defaultProvider: string;
    providers: { bedrock?: ClaudeCodeBedrockConfig };
};

/**
 * The OpenTelemetry export config for the data-app sandbox. Structurally a
 * subset of `lightdashConfig.appRuntime.otel`, so it can be passed straight
 * through. When `enabled` with an `endpoint`, Claude Code's native OTEL tracing
 * is turned on inside the sandbox and pointed at the OTLP collector.
 */
export type ClaudeCodeOtelConfig = {
    enabled: boolean;
    endpoint: string | null;
    protocol: string;
    headers: string | null;
};

/**
 * Resolves the Bedrock config the data-apps pipeline should use:
 * - not on Bedrock (`AI_DEFAULT_PROVIDER` ≠ bedrock) → null (use the Anthropic API)
 * - on Bedrock with credentials + region → the config
 * - on Bedrock but missing credentials or region → throws, rather than silently
 *   falling back to Anthropic or injecting an undefined region (which fails
 *   opaquely at runtime). The AI config schema is parsed leniently
 *   (safeParse → Sentry), so these checks can't be relied on at startup.
 */
const resolveBedrockConfig = (
    copilot: ClaudeCodeProviderConfig,
): ClaudeCodeBedrockConfig | null => {
    if (copilot.defaultProvider !== 'bedrock') {
        return null;
    }
    const { bedrock } = copilot.providers;
    if (!bedrock) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but no Bedrock credentials are configured. Set BEDROCK_API_KEY, BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY, or BEDROCK_USE_DEFAULT_CREDENTIALS (with BEDROCK_REGION).',
        );
    }
    if (!bedrock.region) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but BEDROCK_REGION is not set.',
        );
    }
    return bedrock;
};

/**
 * Builds the environment variables passed to the `claude` CLI inside the E2B
 * sandbox. Data apps follow the same provider switch as the AI copilot: when
 * `AI_DEFAULT_PROVIDER` is `bedrock` they route through Bedrock (bearer token or
 * IAM credentials); for any other provider they use the Anthropic API, since
 * Claude Code only supports Anthropic and Bedrock.
 *
 * `resolveAnthropicApiKey` is a thunk so the Anthropic key is only resolved
 * (and validated) when we actually need it — in Bedrock mode it is never called.
 */
export const buildClaudeCodeEnv = (
    copilot: ClaudeCodeProviderConfig,
    resolveAnthropicApiKey: () => string,
): Record<string, string> => {
    const bedrock = resolveBedrockConfig(copilot);

    if (!bedrock) {
        return { ANTHROPIC_API_KEY: resolveAnthropicApiKey() };
    }

    const base: Record<string, string> = {
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_REGION: bedrock.region,
    };

    if ('apiKey' in bedrock) {
        return { ...base, AWS_BEARER_TOKEN_BEDROCK: bedrock.apiKey };
    }

    if ('accessKeyId' in bedrock) {
        return {
            ...base,
            AWS_ACCESS_KEY_ID: bedrock.accessKeyId,
            AWS_SECRET_ACCESS_KEY: bedrock.secretAccessKey,
            ...(bedrock.sessionToken
                ? { AWS_SESSION_TOKEN: bedrock.sessionToken }
                : {}),
        };
    }

    return base;
};

/**
 * A non-secret, human-readable summary of the env from `buildClaudeCodeEnv`,
 * for logging which provider the sandbox launched with. Never includes the
 * credential values — only the mode and (for Bedrock) the auth method + region.
 */
export const describeClaudeCodeEnv = (env: Record<string, string>): string => {
    if (env.CLAUDE_CODE_USE_BEDROCK !== '1') {
        return 'Anthropic API';
    }
    const method = 'AWS_BEARER_TOKEN_BEDROCK' in env ? 'API key' : 'IAM';
    return `Bedrock (${method}, region=${env.AWS_REGION})`;
};

/**
 * Serializes resource attributes into the `OTEL_RESOURCE_ATTRIBUTES` format
 * (comma-separated `key=value`). Values containing `,` or `=` would corrupt the
 * list, and empty values add nothing, so both are skipped defensively. Our
 * attribution values (uuids, install id) are safe.
 */
const serializeResourceAttributes = (
    attributes: Record<string, string>,
): string =>
    Object.entries(attributes)
        .filter(([, value]) => value !== '' && !/[,=]/.test(value))
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

/**
 * Returns the host of an OTLP endpoint, or null when it is not a parseable URL.
 * Shared so the telemetry env and the firewall allowlist agree on what counts as
 * a usable endpoint — a malformed one is treated as no endpoint by both.
 */
const otelEndpointHost = (endpoint: string): string | null => {
    try {
        return new URL(endpoint).hostname || null;
    } catch {
        return null;
    }
};

/**
 * Builds the OpenTelemetry env that turns on Claude Code's native tracing inside
 * the sandbox and exports it to the configured OTLP collector. Returns an empty
 * object (no telemetry) when disabled, no endpoint is set, or the endpoint is not
 * a parseable URL — a broken endpoint can never be exported to (the firewall
 * allowlist rejects it too), so we leave the sandbox env clean rather than
 * injecting an unusable exporter config. Data apps opt INTO prompt + tool-detail
 * capture (`OTEL_LOG_USER_PROMPTS` / `OTEL_LOG_TOOL_DETAILS`) since the generation
 * PII surface is bounded — metadata-only schema + prompt, no warehouse rows
 * except opt-in sample data. Raw API bodies stay off. Cost is not exported here
 * (it is a metric, not a span attribute) — it stays on the stdout passthrough;
 * the metrics exporter is off so the sandbox is traces-only.
 */
export const buildClaudeCodeTelemetryEnv = (
    otel: ClaudeCodeOtelConfig,
    options: {
        traceparent: string | null;
        resourceAttributes: Record<string, string>;
    },
): Record<string, string> => {
    if (!otel.enabled || !otel.endpoint || !otelEndpointHost(otel.endpoint)) {
        return {};
    }
    const resourceAttributes = serializeResourceAttributes(
        options.resourceAttributes,
    );
    return {
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_LOGS_EXPORTER: 'none',
        // Capture the prompt + tool details on the data-app spans (opt-in,
        // bounded PII surface). Raw API bodies stay off.
        OTEL_LOG_USER_PROMPTS: '1',
        OTEL_LOG_TOOL_DETAILS: '1',
        OTEL_EXPORTER_OTLP_PROTOCOL: otel.protocol,
        OTEL_EXPORTER_OTLP_ENDPOINT: otel.endpoint,
        // Short-lived runs: flush fast so spans land before sandbox teardown.
        OTEL_TRACES_EXPORT_INTERVAL: '1000',
        // Cap each exporter HTTP call so an unreachable or slow collector can't
        // add flush latency to sandbox teardown.
        OTEL_EXPORTER_OTLP_TIMEOUT: '3000',
        ...(otel.headers ? { OTEL_EXPORTER_OTLP_HEADERS: otel.headers } : {}),
        ...(options.traceparent ? { TRACEPARENT: options.traceparent } : {}),
        ...(resourceAttributes
            ? { OTEL_RESOURCE_ATTRIBUTES: resourceAttributes }
            : {}),
    };
};

/**
 * The egress allowlist for the E2B sandbox firewall. Data apps deny all
 * outbound traffic except the LLM endpoint, so this must follow the same
 * provider switch as the env: the Bedrock runtime + control-plane hosts for
 * the region in Bedrock mode, otherwise the Anthropic API host. When OTEL
 * export is enabled, the OTLP collector host is also allowed so the exporter's
 * POSTs are not blocked.
 */
export const claudeCodeAllowedHosts = (
    copilot: ClaudeCodeProviderConfig,
    otel?: ClaudeCodeOtelConfig,
): string[] => {
    const bedrock = resolveBedrockConfig(copilot);
    const llmHosts = !bedrock
        ? ['api.anthropic.com']
        : [
              `bedrock-runtime.${bedrock.region}.amazonaws.com`,
              `bedrock.${bedrock.region}.amazonaws.com`,
          ];

    if (otel?.enabled && otel.endpoint) {
        // Malformed endpoint → host is null, allowlist left unchanged rather
        // than opening an invalid host.
        const host = otelEndpointHost(otel.endpoint);
        if (host) {
            return [...llmHosts, host];
        }
    }

    return llmHosts;
};
