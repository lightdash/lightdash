import { metrics } from '@opentelemetry/api';
import {
    PrometheusExporter,
    PrometheusSerializer,
} from '@opentelemetry/exporter-prometheus';
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

// Registers a global OTel MeterProvider before Sentry.init() so Sentry's
// already-registered http instrumentation emits the stable semconv metric
// http.server.request.duration. Idempotent; one provider per process. Kept in a
// lightweight module so importing it before Sentry.init() does not drag express/
// http into scope and break Sentry's instrumentation patching.
export function initOtelHttpMetrics(config: LightdashConfig['prometheus']) {
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
    await provider?.shutdown();
}
