import { FeatureFlags, type ApiExploreResults } from '@lightdash/common';
import { useEffect } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

/** Reports a tile's virtual-view saved values; only dashboard controls count them as resolving a parameter */
export const useTileVirtualViewSavedParameters = (
    tileUuid: string,
    explore: ApiExploreResults | undefined,
) => {
    const setTileVirtualViewSavedParameters = useDashboardContext(
        (c) => c.setTileVirtualViewSavedParameters,
    );
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const isEnabled = dashboardControlsFlag?.enabled === true;
    useEffect(() => {
        if (!isEnabled) return;
        // No explore (still loading or failed) clears values from an earlier one
        setTileVirtualViewSavedParameters(
            tileUuid,
            explore?.savedParameterValues ?? {},
        );
    }, [explore, isEnabled, setTileVirtualViewSavedParameters, tileUuid]);
};
