import {
    FeatureFlags,
    ForbiddenError,
    MissingConfigError,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

export const isAnalyticsProjectEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    organizationUuid: string,
): Promise<boolean> => {
    const { enabled } = await featureFlagModel.get({
        featureFlagId: FeatureFlags.AnalyticsProject,
        user: { organizationUuid },
    });
    return enabled;
};

export const assertAnalyticsProjectEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    organizationUuid: string,
): Promise<void> => {
    if (
        !(await isAnalyticsProjectEnabled(featureFlagModel, organizationUuid))
    ) {
        throw new ForbiddenError(
            'Internal analytics projects are not enabled for this organization',
        );
    }
};

export const createAnalyticsClient = async (
    organizationUuid: string,
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
): Promise<DuckdbWarehouseClient> => {
    await assertAnalyticsProjectEnabled(featureFlagModel, organizationUuid);
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
            await assertAnalyticsProjectEnabled(
                featureFlagModel,
                organizationUuid,
            );
            return resolveSource();
        },
    });
};
