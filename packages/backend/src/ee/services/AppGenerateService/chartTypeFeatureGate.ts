import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import {
    type FeatureFlagLogicArgs,
    type FeatureFlagModel,
} from '../../../models/FeatureFlagModel/FeatureFlagModel';

/** Chart types are usable wherever Chart Studio is available, the chart type library is on, or data apps are on. */
export const chartTypesEnabledFor = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    chartStudioAvailable: boolean,
    user: FeatureFlagLogicArgs['user'],
): Promise<boolean> => {
    if (chartStudioAvailable) return true;
    const enabled = async (featureFlagId: FeatureFlags) =>
        (await featureFlagModel.get({ user, featureFlagId })).enabled;
    return (
        (await enabled(FeatureFlags.EnableDataApps)) ||
        enabled(FeatureFlags.ChartTypeRegistry)
    );
};

export const assertChartTypesEnabled = async (
    featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    chartStudioAvailable: boolean,
    user: FeatureFlagLogicArgs['user'],
): Promise<void> => {
    if (
        !(await chartTypesEnabledFor(
            featureFlagModel,
            chartStudioAvailable,
            user,
        ))
    ) {
        throw new ForbiddenError('Chart types are not enabled');
    }
};
