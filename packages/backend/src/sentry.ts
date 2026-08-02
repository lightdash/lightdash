import type { NodeOptions } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { lightdashConfig } from './config/lightdashConfig';
import {
    initOtelHttpMetrics,
    shouldSelfRegisterHttpInstrumentation,
} from './prometheus/otelHttpMetrics';
import { otelTracingEnabled } from './tracing/tracing';
import { VERSION } from './version';

const spotlightEnabled =
    process.env.NODE_ENV === 'development' && !!process.env.SENTRY_SPOTLIGHT;

// Use a dummy DSN when Spotlight is enabled but no real DSN is configured.
// This allows Sentry to initialize and send events to Spotlight locally.
const SPOTLIGHT_DUMMY_DSN = 'https://0@o0.ingest.sentry.io/0';

const sentryDsn =
    lightdashConfig.sentry.backend.dsn ||
    (spotlightEnabled ? SPOTLIGHT_DUMMY_DSN : '');

// Register the global OTel MeterProvider before Sentry.init() so the http
// instrumentation emits http.server.request.duration into it. Register our own
// instrumentation only when nobody else will: Sentry's httpIntegration registers
// it when a DSN is set (unless it skips OTel setup for the tracing path), and the
// OTel tracing path registers its own when enabled. With no DSN and no tracing
// (self-hosted without Sentry), we must register it or the metric is never
// recorded.
initOtelHttpMetrics(lightdashConfig.prometheus, {
    registerHttpInstrumentation: shouldSelfRegisterHttpInstrumentation({
        hasSentryDsn: sentryDsn !== '',
        isOtelTracingEnabled: otelTracingEnabled(),
    }),
});

/**
 * Sentry default integrations whose job is emitting spans via bundled OTel
 * instrumentations. When OTLP/GCP is the trace backend, Sentry is errors-only:
 * left in place these register global instrumentation whose spans flood our
 * OTLP exporter (e.g. a pg.query span per Postgres query — Sentry's
 * postgresIntegration, not our NodeSDK, was the source of those).
 */
const SENTRY_SPAN_INTEGRATIONS = new Set([
    'Http',
    'NodeFetch',
    'Express',
    'Postgres',
    'PostgresJs',
    'Knex',
    'Mysql',
    'Mysql2',
    'Graphql',
    'Mongo',
    'Mongoose',
    'Redis',
    'Prisma',
    'Hapi',
    'Koa',
    'Connect',
    'Fastify',
    'Tedious',
    'GenericPool',
    'Dataloader',
    'Amqplib',
    'Kafka',
    'LruMemoizer',
    'VercelAI',
]);

/**
 * Errors-only integration set for OTel mode: strips span-emitting defaults and
 * re-adds Http/NodeFetch with spans disabled — they still provide per-request
 * isolation and breadcrumbs for error capture.
 */
// Two @sentry/core versions coexist in the dependency tree; derive the
// Integration type from @sentry/node so it matches the SDK we call.
type Integration = ReturnType<typeof Sentry.httpIntegration>;

export const errorsOnlyIntegrations = (
    defaultIntegrations: Integration[],
): Integration[] => [
    ...defaultIntegrations.filter(
        (integration) => !SENTRY_SPAN_INTEGRATIONS.has(integration.name),
    ),
    Sentry.httpIntegration({ spans: false }),
    Sentry.nativeNodeFetchIntegration({ spans: false }),
];

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

const anrIntegrations = lightdashConfig.sentry.anr.enabled
    ? [
          Sentry.anrIntegration({
              pollInterval: 50, // ms
              anrThreshold: lightdashConfig.sentry.anr.timeout || 5000, // ms
              captureStackTrace: lightdashConfig.sentry.anr.captureStacktrace,
          }),
      ]
    : [];

const tracesSampler: NodeOptions['tracesSampler'] = (context) => {
    if (spotlightEnabled) {
        return 1.0;
    }

    const request = context.normalizedRequest;
    if (
        request?.url?.endsWith('/status') ||
        request?.url?.endsWith('/health') ||
        request?.url?.endsWith('/favicon.ico') ||
        request?.url?.endsWith('/robots.txt') ||
        request?.url?.endsWith('livez') ||
        request?.headers?.['user-agent']?.includes('GoogleHC')
    ) {
        return 0.0;
    }

    if (context.parentSampled) {
        return context.parentSampled;
    }

    // Boost sampling for async query execution when queryTracesSampleRate is set
    // Set SENTRY_QUERY_TRACES_SAMPLE_RATE=1.0 for 100% attribution on query traces
    const { queryTracesSampleRate } = lightdashConfig.sentry;
    if (queryTracesSampleRate !== null) {
        // Match by span/transaction name (e.g. scheduler-triggered queries)
        const spanName = context.name ?? '';
        if (spanName.includes('ProjectService.executeAsyncQuery')) {
            return queryTracesSampleRate;
        }

        // Match query endpoints (metric-query/dashboard-chart)
        if (request?.url) {
            try {
                const url = new URL(
                    request.url,
                    `http://${request.headers?.host || 'localhost'}`,
                );
                if (
                    /\/api\/v2\/projects\/[^/]+\/query\/(?:metric-query|dashboard-chart)$/.test(
                        url.pathname,
                    )
                ) {
                    return queryTracesSampleRate;
                }
            } catch {
                // Ignore URL parse errors, fall through to default
            }
        }
    }

    return lightdashConfig.sentry.tracesSampleRate;
};

Sentry.init({
    release: VERSION,
    enabled: process.env.NODE_ENV !== 'test',
    dsn: sentryDsn,
    environment:
        process.env.NODE_ENV === 'development'
            ? 'development'
            : lightdashConfig.mode,
    skipOpenTelemetrySetup: otelTracingEnabled(),
    registerEsmLoaderHooks: !otelTracingEnabled(),
    spotlight: spotlightEnabled,
    /**
     * OTel mode (LIGHTDASH_OTEL_TRACES_ENABLED): Sentry is errors-only — span
     * integrations are stripped and no sampler/profiler is configured; traces
     * are owned by the OTel SDK (see tracing.ts). Otherwise Sentry tracing
     * behaves as it always has (self-hosted, local Spotlight).
     * @ref https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/
     */
    integrations: otelTracingEnabled()
        ? (defaultIntegrations) => [
              ...errorsOnlyIntegrations(defaultIntegrations),
              ...anrIntegrations,
          ]
        : [
              nodeProfilingIntegration(),
              ...anrIntegrations,
              ...(lightdashConfig.ai.copilot.enabled &&
              lightdashConfig.ai.copilot.telemetryEnabled
                  ? [
                        Sentry.vercelAIIntegration({
                            recordInputs: true,
                            recordOutputs: true,
                        }),
                    ]
                  : []),
          ],
    ignoreErrors: IGNORE_ERRORS,
    ...(otelTracingEnabled()
        ? {}
        : {
              tracesSampler,
              // x% of samples will be profiled
              profilesSampleRate: lightdashConfig.sentry.profilesSampleRate,
          }),
    beforeBreadcrumb(breadcrumb) {
        if (
            breadcrumb.category === 'http' &&
            breadcrumb?.data?.url &&
            new URL(breadcrumb?.data.url).host ===
                new URL('https://hub.docker.com').host
        ) {
            return null;
        }
        return breadcrumb;
    },
});
