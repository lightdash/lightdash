import { LightdashConfig } from '../../config/parseConfig';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { BufferedEventStreamWriter } from './BufferedEventStreamWriter';

/**
 * Creates the usage event stream writer when the feature is enabled,
 * otherwise returns null so consumers can skip it cheaply.
 */
export const createEventStreamWriter = (
    lightdashConfig: LightdashConfig,
    prometheusMetrics: PrometheusMetrics,
): BufferedEventStreamWriter | null => {
    const { usageEvents } = lightdashConfig;
    if (!usageEvents.enabled || usageEvents.s3 === null) {
        return null;
    }
    return new BufferedEventStreamWriter({
        s3Config: usageEvents.s3,
        flushIntervalMs: usageEvents.flushIntervalMs,
        flushBatchSize: usageEvents.flushBatchSize,
        bufferMaxSize: usageEvents.bufferMaxSize,
        prometheusMetrics,
    });
};
