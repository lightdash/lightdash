import { metrics } from '@opentelemetry/api';
import {
    PrometheusExporter,
    PrometheusSerializer,
} from '@opentelemetry/exporter-prometheus';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { AggregationType, MeterProvider } from '@opentelemetry/sdk-metrics';
import type { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';

// Semconv-recommended boundaries for http.server.request.duration (seconds),
// extended into the long tail (up to 2 minutes) to capture slow requests.
const HTTP_SERVER_DURATION_BUCKETS = [
    0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
    30, 60, 120,
];

let initialized = false;
let reader: PrometheusExporter | null = null;
let provider: MeterProvider | null = null;
let httpInstrumentation: HttpInstrumentation | null = null;

// True when nothing else registers @opentelemetry/instrumentation-http, so we must
// register it ourselves for http.server.request.duration to be recorded. Sentry's
// default httpIntegration registers it when a DSN is configured; the OTel tracing
// path registers its own when enabled. Registering when either is true would
// double-count. Pure so it can be unit-tested as the regression guard.
export function shouldSelfRegisterHttpInstrumentation({
    hasSentryDsn,
    isOtelTracingEnabled,
}: {
    hasSentryDsn: boolean;
    isOtelTracingEnabled: boolean;
}): boolean {
    return !hasSentryDsn && !isOtelTracingEnabled;
}

// Registers a global OTel MeterProvider before Sentry.init() so the http
// instrumentation emits the stable semconv metric http.server.request.duration
// into it. Idempotent; one provider per process. Kept in a lightweight module so
// importing it before Sentry.init() does not drag express/http into scope and
// break instrumentation patching.
//
// `registerHttpInstrumentation` must be true only when nothing else registers
// @opentelemetry/instrumentation-http. Sentry's default httpIntegration registers
// it when a DSN is configured, and the OTel tracing path registers its own when
// enabled; in either case we must NOT register a second one (double-counting).
// When neither does (self-hosted with no Sentry DSN), the metric was never
// recorded — so we register the instrumentation ourselves.
export function initOtelHttpMetrics(
    config: LightdashConfig['prometheus'],
    { registerHttpInstrumentation }: { registerHttpInstrumentation: boolean },
) {
    if (initialized) {
        return;
    }
    if (!config.httpMetricsEnabled) {
        return;
    }
    initialized = true;
    try {
        process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http';
        reader = new PrometheusExporter({ preventServerStart: true });
        provider = new MeterProvider({
            readers: [reader],
            views: [
                // Rename to the canonical Prometheus name (the serializer does
                // not append the `s` unit suffix) and set our bucket layout.
                {
                    instrumentName: 'http.server.request.duration',
                    name: 'http_server_request_duration_seconds',
                    aggregation: {
                        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
                        options: { boundaries: HTTP_SERVER_DURATION_BUCKETS },
                    },
                },
                // Drop the outbound client metric — instrumentation-http emits it
                // too, but it is out of scope here and its server_address/
                // server_port labels add unwanted cardinality.
                {
                    instrumentName: 'http.client.request.duration',
                    aggregation: { type: AggregationType.DROP },
                },
            ],
        });
        metrics.setGlobalMeterProvider(provider);

        if (registerHttpInstrumentation) {
            // Constructing after setGlobalMeterProvider binds the instrumentation
            // to our provider and enables the require-in-the-middle http patch,
            // and OTEL_SEMCONV_STABILITY_OPT_IN (set above) is read in the
            // constructor so the stable metric name is used.
            httpInstrumentation = new HttpInstrumentation();
            httpInstrumentation.setMeterProvider(provider);
        }
    } catch (e) {
        Logger.error('Error initializing OTel HTTP metrics', e);
    }
}

// Serializes the OTel-collected HTTP metrics in Prometheus text format, to be
// concatenated onto the prom-client exposition on the existing /metrics body.
export async function serializeOtelHttpMetrics(): Promise<string> {
    if (!reader) {
        return '';
    }
    const { resourceMetrics } = await reader.collect();
    return new PrometheusSerializer().serialize(resourceMetrics);
}

export async function shutdownOtelHttpMetrics() {
    httpInstrumentation?.disable();
    await provider?.shutdown();
}
