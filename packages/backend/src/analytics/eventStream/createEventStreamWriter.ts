import { FeatureFlags } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { BufferedEventStreamWriter } from './BufferedEventStreamWriter';

export const USAGE_CAPTURE_FLAG_TTL_MS = 60_000;

export const cachedUsageCaptureEligibility = (
    getFeatureFlagModel: () => Pick<FeatureFlagModel, 'get'>,
): ((organizationUuid: string) => Promise<boolean>) => {
    const cache = new Map<
        string,
        { expiresAt: number; enabled: Promise<boolean> }
    >();
    return (organizationUuid) => {
        const cached = cache.get(organizationUuid);
        if (cached && cached.expiresAt > Date.now()) return cached.enabled;
        if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
        const enabled = Promise.resolve().then(async () => {
            try {
                return (
                    await getFeatureFlagModel().get({
                        featureFlagId: FeatureFlags.AnalyticsProject,
                        user: { organizationUuid },
                    })
                ).enabled;
            } catch {
                Logger.warn(
                    'Usage capture flag lookup failed; skipping capture until the next check',
                );
                return false;
            }
        });
        cache.set(organizationUuid, {
            expiresAt: Date.now() + USAGE_CAPTURE_FLAG_TTL_MS,
            enabled,
        });
        return enabled;
    };
};
export const createEventStreamWriter = (
    lightdashConfig: LightdashConfig,
    prometheusMetrics: PrometheusMetrics,
    getFeatureFlagModel: () => Pick<FeatureFlagModel, 'get'>,
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
        isOrganizationEnabled:
            cachedUsageCaptureEligibility(getFeatureFlagModel),
    });
};
