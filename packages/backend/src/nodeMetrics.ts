import opentelemetry, { ValueType } from '@opentelemetry/api';
import * as perf_hooks from 'perf_hooks';
import { VERSION } from './version';

const eventLoopLagHistogram = perf_hooks.monitorEventLoopDelay();
let eventLoopLagP99Value: number | undefined;
let eventLoopLagP90Value: number | undefined;
let eventLoopLagP50Value: number | undefined;

const meter = opentelemetry.metrics.getMeter('lightdash-worker', VERSION);
const eventLoopLag99Gauge = meter.createObservableGauge(
    'nodejs.eventloop.lag_p99_ms',
    {
        description: 'P99 event loop lag in milliseconds',
        unit: 'milliseconds',
        valueType: ValueType.DOUBLE,
    },
);
const eventLoopLag90Gauge = meter.createObservableGauge(
    'nodejs.eventloop.lag_p90_ms',
    {
        description: 'P90 event loop lag in milliseconds',
        unit: 'milliseconds',
        valueType: ValueType.DOUBLE,
    },
);
const eventLoopLag50Gauge = meter.createObservableGauge(
    'nodejs.eventloop.lag_p50_ms',
    {
        description: 'P50 event loop lag in milliseconds',
        unit: 'milliseconds',
        valueType: ValueType.DOUBLE,
    },
);

export const registerNodeMetrics = () => {
    eventLoopLagHistogram.enable();

    eventLoopLag99Gauge.addCallback((result) => {
        // Get values in ns and convert to ms
        // Record all values and then reset the histogram for the next observation
        eventLoopLagP99Value = eventLoopLagHistogram.percentile(99) / 1e6;
        eventLoopLagP90Value = eventLoopLagHistogram.percentile(90) / 1e6;
        eventLoopLagP50Value = eventLoopLagHistogram.percentile(50) / 1e6;
        result.observe(eventLoopLagP99Value);
        eventLoopLagHistogram.reset();
    });
    eventLoopLag90Gauge.addCallback((result) => {
        if (eventLoopLagP90Value) {
            result.observe(eventLoopLagP90Value);
        }
    });
    eventLoopLag50Gauge.addCallback((result) => {
        if (eventLoopLagP50Value) {
            result.observe(eventLoopLagP50Value);
        }
    });
};
