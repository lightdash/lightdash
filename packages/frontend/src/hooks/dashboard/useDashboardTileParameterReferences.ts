import {
    FeatureFlags,
    type ApiError,
    type DashboardTileParameterReferences,
    type DashboardTileParameterReferencesTile,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
    dashboardParametersActions,
    selectTileQuerySources,
    selectTileQuerySourcesKey,
    type DashboardStore,
} from '../../features/dashboard/store';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

/**
 * Registers the parameters every tile uses, on every tab, before any tile
 * runs. Embeds keep learning them from each tile's query response.
 */
export const useDashboardTileParameterReferences = ({
    store,
    projectUuid,
    embedToken,
}: {
    store: DashboardStore;
    projectUuid: string | undefined;
    embedToken: string | undefined;
}) => {
    const lightdashApi = useLightdashApi();
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const tilesKey = useSyncExternalStore(store.subscribe, () =>
        selectTileQuerySourcesKey(store.getState()),
    );
    const tiles = useMemo<DashboardTileParameterReferencesTile[]>(
        () => selectTileQuerySources(store.getState()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store, tilesKey],
    );
    const isEnabled =
        dashboardControlsFlag?.enabled === true &&
        !embedToken &&
        !!projectUuid &&
        tiles.length > 0;

    const { data } = useQuery<DashboardTileParameterReferences[], ApiError>({
        queryKey: [
            'dashboards',
            'tileParameterReferences',
            projectUuid,
            tilesKey,
        ],
        queryFn: () =>
            lightdashApi<DashboardTileParameterReferences[]>({
                url: `/projects/${projectUuid}/dashboards/tile-parameter-references`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify({ tiles }),
            }),
        enabled: isEnabled,
    });

    useEffect(() => {
        if (!isEnabled || !data) return;
        data.forEach((result) => {
            // A failed tile keeps whatever its own query response registers
            if (result.error !== null) return;
            store.dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid: result.tileUuid,
                    references: result.parameterReferences,
                }),
            );
        });
    }, [data, isEnabled, store]);
};
