import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

/**
 * Usage of chart types follows either flag, mirroring the backend's
 * assertChartTypesEnabled: a customer without data apps can still install
 * and use library chart types. Authoring gates check EnableDataApps alone.
 */
export const useChartTypesEnabled = () => {
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const libraryFlag = useServerFeatureFlag(FeatureFlags.ChartTypeRegistry);
    return {
        isLoading: dataAppsFlag.isLoading || libraryFlag.isLoading,
        enabled:
            dataAppsFlag.data?.enabled === true ||
            libraryFlag.data?.enabled === true,
    };
};
