import type { DataAppOtelConfig } from '../../../config/parseConfig';

/**
 * The generic OTLP settings the sandbox env builder needs — a structural subset
 * of `DataAppOtelConfig` with the auth path stripped out. Header resolution
 * (and any provider-specific token minting) is handled separately so this
 * module stays free of GCP/Bedrock/etc. specifics. See `gcpOtelAuth.ts`.
 */
export type ClaudeCodeOtelExporterConfig = {
    endpoint: string;
    protocol: string;
    exportIntervalMs: number;
};

/**
 * Serialise export headers into the `OTEL_EXPORTER_OTLP_HEADERS` format:
 * a comma-separated list of `key=value` pairs. Bearer tokens and project ids
 * contain no commas, so no escaping is required for the values we emit.
 */
const encodeOtlpHeaders = (headers: Record<string, string>): string =>
    Object.entries(headers)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

/**
 * Builds the Claude Code OpenTelemetry env vars injected into the sandbox so the
 * `claude` CLI exports a per-build trace (a span per LLM request / tool call) to
 * our OTLP collector. Traces only — metrics and logs exporters are turned off so
 * nothing but spans leave the sandbox (cost comes from the stdout passthrough,
 * not metrics) and user prompts stay redacted (Claude Code's default).
 *
 * `traceparent`, when present, nests the sandbox's interaction span under the
 * backend's `DataApp.generate` parent so both form a single trace. `headers` are
 * the freshly resolved OTLP export auth headers (empty for an unauthenticated
 * collector).
 */
export const buildClaudeCodeOtelEnv = (
    config: ClaudeCodeOtelExporterConfig,
    headers: Record<string, string>,
    traceparent: string | undefined,
): Record<string, string> => {
    const env: Record<string, string> = {
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_LOGS_EXPORTER: 'none',
        OTEL_EXPORTER_OTLP_PROTOCOL: config.protocol,
        OTEL_EXPORTER_OTLP_ENDPOINT: config.endpoint,
        OTEL_TRACES_EXPORT_INTERVAL: String(config.exportIntervalMs),
    };

    const encodedHeaders = encodeOtlpHeaders(headers);
    if (encodedHeaders) {
        env.OTEL_EXPORTER_OTLP_HEADERS = encodedHeaders;
    }

    if (traceparent) {
        env.TRACEPARENT = traceparent;
    }

    return env;
};

/**
 * The collector host(s) the sandbox firewall must allow so the OTLP exporter can
 * reach our collector. Empty when tracing is disabled or the endpoint is unset /
 * unparseable, so it composes cleanly with the LLM egress allowlist.
 */
export const claudeCodeOtelAllowedHosts = (
    config: DataAppOtelConfig,
): string[] => {
    if (!config.enabled || !config.endpoint) {
        return [];
    }
    try {
        return [new URL(config.endpoint).hostname];
    } catch {
        return [];
    }
};
