import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import {
    type FeatureFlagLogicArgs,
    type FeatureFlagModel,
} from '../../../models/FeatureFlagModel/FeatureFlagModel';

export const assertChartTypesEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: FeatureFlagLogicArgs['user'],
): Promise<void> => {
    const enabled = async (featureFlagId: FeatureFlags) =>
        (await featureFlagModel.get({ user, featureFlagId })).enabled;

    const allowed =
        (await enabled(FeatureFlags.EnableDataApps)) ||
        (await enabled(FeatureFlags.ChartTypeRegistry));
    if (!allowed) {
        throw new ForbiddenError('Chart types are not enabled');
    }
};
