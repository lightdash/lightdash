import {
    FeatureFlags,
    ForbiddenError,
    MissingConfigError,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

/** Temporary local triage configuration, NOT a production credential strategy. */
export const isLocalAnalyticsProjectEnabled = (
    organizationUuid: string,
): boolean =>
    process.env.NODE_ENV === 'development' &&
    lightdashConfig.enabledFeatureFlags.has(FeatureFlags.AnalyticsProject) &&
    !lightdashConfig.disabledFeatureFlags.has(FeatureFlags.AnalyticsProject) &&
    process.env.LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID === organizationUuid;

export const assertLocalAnalyticsProjectEnabled = (
    organizationUuid: string,
): void => {
    if (!isLocalAnalyticsProjectEnabled(organizationUuid)) {
        throw new ForbiddenError(
            'Internal analytics projects are not enabled for this organization',
        );
    }
};

export const createLocalAnalyticsClient = (
    organizationUuid: string,
): DuckdbWarehouseClient => {
    assertLocalAnalyticsProjectEnabled(organizationUuid);
    const storage = lightdashConfig.usageEvents.s3;
    if (!storage) {
        throw new MissingConfigError('Usage events storage is not configured');
    }
    const resolveSource = createS3AnalyticsSourceResolver({
        storage,
        // Explicit local demo binding only; production must use the persisted org.
        organizationUuid:
            process.env.LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID ?? '',
    });
    return new DuckdbWarehouseClient({
        type: 'duckdb_parquet',
        resolveSource: async () => {
            assertLocalAnalyticsProjectEnabled(organizationUuid);
            return resolveSource();
        },
    });
};
