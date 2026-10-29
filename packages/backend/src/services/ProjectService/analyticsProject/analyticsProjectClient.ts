import { ForbiddenError, MissingConfigError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

export const assertAnalyticsProjectEnabled = async (
    isAnalyticsProjectEnabled: () => boolean,
): Promise<void> => {
    if (!isAnalyticsProjectEnabled()) {
        throw new ForbiddenError('Managed analytics is not enabled');
    }
};

export const createAnalyticsClient = async (
    organizationUuid: string,
    isAnalyticsProjectEnabled: () => boolean,
    options: { allowEmpty?: boolean } = {},
): Promise<DuckdbWarehouseClient> => {
    await assertAnalyticsProjectEnabled(isAnalyticsProjectEnabled);
    const storage = lightdashConfig.usageEvents.s3;
    if (!storage) {
        throw new MissingConfigError('Usage events storage is not configured');
    }
    const resolveSource = createS3AnalyticsSourceResolver({
        storage,
        organizationUuid,
        ...options,
    });
    return new DuckdbWarehouseClient({
        type: 'duckdb_parquet',
        resolveSource: async (referencedTables) => {
            await assertAnalyticsProjectEnabled(isAnalyticsProjectEnabled);
            return resolveSource(referencedTables);
        },
    });
};
