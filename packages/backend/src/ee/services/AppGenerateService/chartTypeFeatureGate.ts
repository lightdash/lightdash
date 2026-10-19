import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import {
    type FeatureFlagLogicArgs,
    type FeatureFlagModel,
} from '../../../models/FeatureFlagModel/FeatureFlagModel';

export const chartTypesEnabledFor = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: FeatureFlagLogicArgs['user'],
): Promise<boolean> => {
    const enabled = async (featureFlagId: FeatureFlags) =>
        (await featureFlagModel.get({ user, featureFlagId })).enabled;

    return (
        (await enabled(FeatureFlags.EnableDataApps)) ||
        (await enabled(FeatureFlags.ChartTypeRegistry))
    );
};

export const assertChartTypesEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    user: FeatureFlagLogicArgs['user'],
): Promise<void> => {
    if (!(await chartTypesEnabledFor(featureFlagModel, user))) {
        throw new ForbiddenError('Chart types are not enabled');
    }
};
