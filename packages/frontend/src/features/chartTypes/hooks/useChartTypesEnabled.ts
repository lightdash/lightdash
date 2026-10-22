import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { useChartStudioAvailable } from './useChartStudioAvailable';

/** Chart Studio, or the library or data apps flag with a valid licence; authoring checks useChartStudioAvailable alone. */
export const useChartTypesEnabled = () => {
    const { health } = useApp();
    const isLicensed = health.data?.license?.valid === true;
    const chartStudioAvailable = useChartStudioAvailable();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const libraryFlag = useServerFeatureFlag(FeatureFlags.ChartTypeRegistry);
    const enabled =
        chartStudioAvailable ||
        (isLicensed &&
            (dataAppsFlag.data?.enabled === true ||
                libraryFlag.data?.enabled === true));
    return {
        isLoading:
            !enabled &&
            (health.isLoading ||
                dataAppsFlag.isLoading ||
                libraryFlag.isLoading),
        enabled,
    };
};
