import { EventEmitter } from 'events';
import prometheus from 'prom-client';
import type { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';

/**
 * Configuration for a single metric to track
 */
export type MetricConfig = {
    /**
     * The event name to listen for (e.g., 'user.logged_in', 'query.executed')
     */
    eventName: string;

    /**
     * The Prometheus metric name (e.g., 'lightdash_user_login_total')
     */
    metricName: string;

    /**
     * Help text for the Prometheus metric
     */
    help: string;

    /**
     * Label names for the Prometheus counter
     * These will be extracted from the event payload properties
     */
    labelNames: string[];

    /**
     * Optional function to extract label values from the event payload
     * If not provided, labels will be extracted directly from payload.properties
     * using the labelNames as keys
     */
    extractLabels?: (payload: {
        event: string;
        userId?: string;
        anonymousId?: string;
        properties?: Record<string, unknown>;
    }) => Record<string, string>;
};

/**
 * Configuration for the PrometheusEventMetricManager
 */
export type PrometheusEventMetricManagerConfig = {
    /**
     * Array of metric configurations
     */
    metrics: MetricConfig[];

    /**
     * Prometheus configuration (for prefix, etc.)
     */
    prometheusConfig: LightdashConfig['prometheus'];
};

/**
 * PrometheusEventMetricManager - Configuration-driven Prometheus metrics from Lightdash events
 *
 * This class:
 * 1. Accepts a JSON configuration of events to track
 * 2. Initializes prom-client Counters for each event in the config
 * 3. Subscribes to LightdashAnalytics track calls and increments counters
 * 4. Dynamically extracts labels from event payloads based on config
 */
export class PrometheusEventMetricManager {
    private readonly config: PrometheusEventMetricManagerConfig;

    private readonly eventEmitter: EventEmitter;

    private readonly counters: Map<string, prometheus.Counter<string>> =
        new Map();

    private readonly eventListeners: Map<
        string,
        (payload: Parameters<LightdashAnalytics['track']>[0]) => void
    > = new Map();

    private isInitialized = false;

    constructor(
        config: PrometheusEventMetricManagerConfig,
        eventEmitter: EventEmitter,
    ) {
        this.config = config;
        this.eventEmitter = eventEmitter;
    }

    /**
     * Initialize the metric manager:
     * - Create Prometheus counters for each configured metric
     * - Hook into LightdashAnalytics track method
     * - Register metrics with the global Prometheus registry
     */
    public initialize(): void {
        if (this.isInitialized) {
            Logger.warn('PrometheusEventMetricManager already initialized');
            return;
        }

        const { enabled, prefix } = this.config.prometheusConfig;

        if (!enabled) {
            Logger.info(
                'Prometheus is disabled, skipping PrometheusEventMetricManager initialization',
            );
            return;
        }

        try {
            // Initialize counters for each configured metric
            for (const metricConfig of this.config.metrics) {
                const counter = new prometheus.Counter({
                    name: `${prefix ?? ''}${metricConfig.metricName}`,
                    help: metricConfig.help,
                    labelNames: metricConfig.labelNames,
                });

                // Register with global Prometheus registry
                try {
                    prometheus.register.registerMetric(counter);
                } catch (error) {
                    Logger.warn(
                        `Prometheus counter already registered: ${metricConfig.metricName}`,
                        error,
                    );
                }

                this.counters.set(metricConfig.eventName, counter);

                Logger.info(
                    `Registered Prometheus counter: ${metricConfig.metricName} for event: ${metricConfig.eventName}`,
                );
            }

            this.subscribeToAnalyticsEvents();

            this.isInitialized = true;
            Logger.info(
                `PrometheusEventMetricManager initialized with ${this.config.metrics.length} metrics`,
            );
        } catch (error) {
            Logger.error('Error initializing PrometheusEventMetricManager', error);
            throw error;
        }
    }

    private subscribeToAnalyticsEvents(): void {
        const metricsByEvent = new Map<string, MetricConfig[]>();

        for (const metricConfig of this.config.metrics) {
            const configs = metricsByEvent.get(metricConfig.eventName) ?? [];
            configs.push(metricConfig);
            metricsByEvent.set(metricConfig.eventName, configs);
        }

        for (const [eventName, metricConfigs] of metricsByEvent) {
            const eventKey = PrometheusEventMetricManager.toAnalyticsEventKey(
                eventName,
            );
            const handler = (
                payload: Parameters<LightdashAnalytics['track']>[0],
            ) => {
                this.handleTrackEvent(payload, metricConfigs);
            };

            this.eventEmitter.on(eventKey, handler);
            this.eventListeners.set(eventKey, handler);
        }
    }

    private static toAnalyticsEventKey(eventName: string): string {
        return `analytics.track.${eventName}`;
    }

    /**
     * Handle a track event and increment the appropriate counters
     */
    private handleTrackEvent(
        payload: Parameters<LightdashAnalytics['track']>[0],
        metricConfigs: MetricConfig[],
    ): void {
        const eventName = payload.event;
        for (const metricConfig of metricConfigs) {
            const counter = this.counters.get(metricConfig.eventName);

            if (counter) {
                try {
                    // Extract label values
                    const labelValues =
                        PrometheusEventMetricManager.extractLabelValues(
                        metricConfig,
                        payload,
                    );

                    // Increment the counter
                    counter.inc(labelValues);
                } catch (error) {
                    Logger.error(
                        `Error incrementing counter for event ${eventName}`,
                        error,
                    );
                }
            } else {
                Logger.warn(
                    `Counter not found for event: ${metricConfig.eventName}`,
                );
            }
        }
    }

    /**
     * Extract label values from the event payload based on the metric config
     */
    private static extractLabelValues(
        metricConfig: MetricConfig,
        payload: Parameters<LightdashAnalytics['track']>[0],
    ): Record<string, string> {
        // Use custom extractor if provided
        if (metricConfig.extractLabels) {
            const extracted = metricConfig.extractLabels({
                event: payload.event,
                userId: payload.userId,
                anonymousId: payload.anonymousId,
                properties: payload.properties,
            });
            const extractedEntries = Object.entries(extracted);

            if (
                extractedEntries.some(
                    ([, value]) =>
                        typeof value !== 'string' ||
                        value.length === 0 ||
                        value.length > 200,
                )
            ) {
                Logger.warn(
                    `Invalid label values returned by extractLabels for event ${payload.event}, falling back to "unknown"`,
                );
                return metricConfig.labelNames.reduce(
                    (acc, labelName) => ({
                        ...acc,
                        [labelName]: 'unknown',
                    }),
                    {} as Record<string, string>,
                );
            }

            return extracted;
        }

        // Default: extract from payload.properties using labelNames as keys
        const labelValues: Record<string, string> = {};

        for (const labelName of metricConfig.labelNames) {
            const value: unknown = payload.properties?.[labelName];

            // Convert value to string, or use 'unknown' if not found
            labelValues[labelName] =
                value !== undefined && value !== null
                    ? String(value)
                    : 'unknown';
        }

        return labelValues;
    }

    /**
     * Cleanup: remove event listeners
     */
    public cleanup(): void {
        for (const [eventKey, handler] of this.eventListeners) {
            this.eventEmitter.off(eventKey, handler);
        }
        this.eventListeners.clear();
        this.isInitialized = false;
    }
}
