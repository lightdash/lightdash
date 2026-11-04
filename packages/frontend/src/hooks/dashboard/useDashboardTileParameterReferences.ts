import {
    FeatureFlags,
    getErrorMessage,
    type ApiError,
    type DashboardTileParameterReferences,
    type DashboardTileParameterReferencesTile,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { chunk } from 'es-toolkit/compat';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
    dashboardParametersActions,
    selectTileQuerySources,
    selectTileQuerySourcesKey,
    type DashboardStore,
} from '../../features/dashboard/store';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

const TILES_PER_REQUEST = 200;

/**
 * Registers the parameters every tile uses, on every tab, before any tile
 * runs. In embeds the API client sends the embed token.
 */
export const useDashboardTileParameterReferences = ({
    store,
    projectUuid,
}: {
    store: DashboardStore;
    projectUuid: string | undefined;
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
        !!projectUuid &&
        tiles.length > 0;

    const { data } = useQuery<DashboardTileParameterReferences[], ApiError>({
        queryKey: [
            'dashboards',
            'tileParameterReferences',
            projectUuid,
            tilesKey,
        ],
        // The endpoint takes at most 200 tiles a request; larger dashboards go
        // in turns, and a failed request fails only its own tiles
        queryFn: () =>
            chunk(tiles, TILES_PER_REQUEST).reduce<
                Promise<DashboardTileParameterReferences[]>
            >(
                async (previous, batch) => [
                    ...(await previous),
                    ...(await lightdashApi<DashboardTileParameterReferences[]>({
                        url: `/projects/${projectUuid}/dashboards/tile-parameter-references`,
                        version: 'v2',
                        method: 'POST',
                        body: JSON.stringify({ tiles: batch }),
                    }).catch((e: unknown) =>
                        batch.map(({ tileUuid }) => ({
                            tileUuid,
                            parameterReferences: null,
                            error: getErrorMessage(e),
                        })),
                    )),
                ],
                Promise.resolve([]),
            ),
        enabled: isEnabled,
    });

    useEffect(() => {
        if (!isEnabled || !data) return;
        // A failed tile keeps what its own query response registers
        const listedByTile = Object.fromEntries(
            data.flatMap((result) =>
                result.error === null
                    ? [[result.tileUuid, result.parameterReferences]]
                    : [],
            ),
        );
        if (Object.keys(listedByTile).length === 0) return;
        store.dispatch(
            dashboardParametersActions.addListedParameterReferencesByTile(
                listedByTile,
            ),
        );
    }, [data, isEnabled, store]);
};
