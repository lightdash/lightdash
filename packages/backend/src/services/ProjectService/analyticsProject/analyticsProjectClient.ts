import {
    FeatureFlags,
    ForbiddenError,
    MissingConfigError,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

export const isAnalyticsProjectEnabled = (): boolean =>
    lightdashConfig.enabledFeatureFlags.has(FeatureFlags.AnalyticsProject) &&
    !lightdashConfig.disabledFeatureFlags.has(FeatureFlags.AnalyticsProject);

export const assertAnalyticsProjectEnabled = (): void => {
    if (!isAnalyticsProjectEnabled()) {
        throw new ForbiddenError(
            'Internal analytics projects are not enabled for this organization',
        );
    }
};

export const createAnalyticsClient = (
    organizationUuid: string,
): DuckdbWarehouseClient => {
    assertAnalyticsProjectEnabled();
    const storage = lightdashConfig.usageEvents.s3;
    if (!storage) {
        throw new MissingConfigError('Usage events storage is not configured');
    }
    const resolveSource = createS3AnalyticsSourceResolver({
        storage,
        organizationUuid,
    });
    return new DuckdbWarehouseClient({
        type: 'duckdb_parquet',
        resolveSource: async () => {
            assertAnalyticsProjectEnabled();
            return resolveSource();
        },
    });
};
