import { FeatureFlags, type ApiExploreResults } from '@lightdash/common';
import { useEffect } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

/** Reports a tile's virtual-view saved values; only dashboard controls count them as resolving a parameter */
export const useTileVirtualViewSavedParameters = (
    tileUuid: string,
    explore: ApiExploreResults | undefined,
    isMergedChart: boolean,
) => {
    const setTileVirtualViewSavedParameters = useDashboardContext(
        (c) => c.setTileVirtualViewSavedParameters,
    );
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const isEnabled = dashboardControlsFlag?.enabled === true;
    useEffect(() => {
        // While the explore loads, keep the listed values; a chart swap clears them in the store
        // A merged chart's other queries have explores this tile never loads: keep the listed values
        if (!isEnabled || !explore || isMergedChart) return;
        setTileVirtualViewSavedParameters(
            tileUuid,
            explore.savedParameterValues ?? {},
        );
    }, [
        explore,
        isEnabled,
        isMergedChart,
        setTileVirtualViewSavedParameters,
        tileUuid,
    ]);
};
