import * as Sentry from '@sentry/node';
import type { LightdashConfig } from '../config/parseConfig';

// Derive the Sentry types from the installed @sentry/node runtime rather than
// importing from @sentry/core directly — the backend pins a different
// @sentry/core version, so a direct type import resolves to a mismatched copy.
type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type SamplingContext = Parameters<
    NonNullable<SentryInitOptions['tracesSampler']>
>[0];

export const IGNORE_ERRORS = [
    'WarehouseConnectionError',
    'WarehouseQueryError',
    'FieldReferenceError',
    'NotEnoughResults',
    'CompileError',
    'NotFoundError',
    'ForbiddenError',
    'TokenError',
    'AuthorizationError',
    'SshTunnelError',
    'ReadFileError',
    'AiAgentValidatorError',
    'UserInfoError', // Google oauth2 error when using invalid credentials
    // Invalid user-supplied parameter (e.g. AI writeback requires a GitHub
    // dbt connection but the project uses "none") — surfaced to the user,
    // not a server bug.
    'ParameterError',
];

/**
 * The Vercel AI SDK integration captures `generateText`/`streamText`/
 * `generateObject`/`embed` calls as spans for Sentry's AI Agents dashboard.
 * Shared so the scheduler and NATS workers — where Slack agent responses,
 * writebacks, and embeddings actually run — capture AI spans too, not just
 * the synchronous API pod.
 */
export const getSentryAiIntegrations = (lightdashConfig: LightdashConfig) =>
    lightdashConfig.ai.copilot.enabled &&
    lightdashConfig.ai.copilot.telemetryEnabled
        ? [
              Sentry.vercelAIIntegration({
                  recordInputs: true,
                  recordOutputs: true,
              }),
          ]
        : [];

// AI SDK spans carry OpenTelemetry GenAI attributes; on the workers they
// surface as their own root transactions (no HTTP parent), so we match on
// these attribute prefixes to sample them.
const AI_SPAN_ATTRIBUTE_PREFIXES = ['gen_ai.', 'ai.'];

// Synchronous web agent endpoints on the API pod — here the AI call is a
// child of the HTTP transaction, so we boost the request transaction itself.
const AI_AGENT_ENDPOINT_RE =
    /\/aiAgents\/[^/]+\/threads\/[^/]+\/(stream|messages)$/;

/**
 * Returns the AI traces sample rate when this trace is AI-related — a web
 * agent request or an AI SDK span on a worker — otherwise null so the caller
 * falls back to its own default. Returns null entirely when copilot telemetry
 * is disabled, leaving non-AI sampling untouched.
 */
export const getAiTracesSampleRate = (
    context: SamplingContext,
    lightdashConfig: LightdashConfig,
): number | null => {
    if (
        !lightdashConfig.ai.copilot.enabled ||
        !lightdashConfig.ai.copilot.telemetryEnabled
    ) {
        return null;
    }

    const { aiTracesSampleRate } = lightdashConfig.sentry;

    const url = context.normalizedRequest?.url;
    if (url) {
        try {
            const { pathname } = new URL(url, 'http://localhost');
            if (AI_AGENT_ENDPOINT_RE.test(pathname)) {
                return aiTracesSampleRate;
            }
        } catch {
            // Ignore URL parse errors, fall through
        }
    }

    const attributes = context.attributes ?? {};
    if (
        Object.keys(attributes).some((key) =>
            AI_SPAN_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix)),
        )
    ) {
        return aiTracesSampleRate;
    }

    return null;
};
