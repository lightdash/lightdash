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
        if (!isEnabled || !explore) return;
        // A merged chart's other queries have explores this tile never loads: a partial answer
        setTileVirtualViewSavedParameters(
            tileUuid,
            explore.savedParameterValues ?? {},
            isMergedChart,
        );
    }, [
        explore,
        isEnabled,
        isMergedChart,
        setTileVirtualViewSavedParameters,
        tileUuid,
    ]);
};
