import {
    FeatureFlags,
    getErrorMessage,
    type ApiError,
    type DashboardTileParameterReferences,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { chunk } from 'es-toolkit/compat';
import { useEffect, useSyncExternalStore } from 'react';
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
 * Registers the parameters and saved values of every tile, on every tab,
 * before any tile runs, so controls don't depend on which tiles have run.
 * In embeds the API client sends the embed token.
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
    const isEnabled =
        dashboardControlsFlag?.enabled === true &&
        !!projectUuid &&
        tilesKey !== '';

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
            chunk(
                selectTileQuerySources(store.getState()),
                TILES_PER_REQUEST,
            ).reduce<Promise<DashboardTileParameterReferences[]>>(
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
        if (
            !isEnabled ||
            !data ||
            selectTileQuerySourcesKey(store.getState()) !== tilesKey
        )
            return;
        const sourceByTile = Object.fromEntries(
            selectTileQuerySources(store.getState()).map((source) => [
                source.tileUuid,
                JSON.stringify(source),
            ]),
        );
        const complete = data.flatMap((result) =>
            result.error === null &&
            result.parameterDefinitions !== undefined &&
            // older servers omit saved values; leave those tiles unlisted
            'chartSavedValues' in result &&
            sourceByTile[result.tileUuid] !== undefined
                ? [result]
                : [],
        );
        const completeTiles = new Set(complete.map(({ tileUuid }) => tileUuid));
        const { tileListedParameterSources } = store.getState().parameters;
        // A failed refetch keeps a good listing of the same source
        const failed = data.filter(
            ({ tileUuid }) =>
                sourceByTile[tileUuid] !== undefined &&
                !completeTiles.has(tileUuid) &&
                tileListedParameterSources[tileUuid] !== sourceByTile[tileUuid],
        );
        if (failed.length > 0)
            store.dispatch(
                dashboardParametersActions.markParameterReferencesFailed(
                    Object.fromEntries(
                        failed.map(({ tileUuid }) => [
                            tileUuid,
                            sourceByTile[tileUuid],
                        ]),
                    ),
                ),
            );
        if (complete.length === 0) return;
        store.dispatch(
            dashboardParametersActions.addDiscoveredParameterReferences({
                references: Object.fromEntries(
                    complete.map((result) => [
                        result.tileUuid,
                        result.parameterReferences,
                    ]),
                ),
                definitions: Object.assign(
                    {},
                    ...complete.map((result) => result.parameterDefinitions),
                ),
                chartSavedValues: Object.fromEntries(
                    complete.map((result) => [
                        result.tileUuid,
                        result.chartSavedValues,
                    ]),
                ),
                virtualViewSavedValues: Object.fromEntries(
                    complete.map((result) => [
                        result.tileUuid,
                        result.virtualViewSavedValues,
                    ]),
                ),
                sources: Object.fromEntries(
                    complete.map((result) => [
                        result.tileUuid,
                        sourceByTile[result.tileUuid],
                    ]),
                ),
            }),
        );
    }, [data, isEnabled, store, tilesKey]);
};
