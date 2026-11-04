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
 * While editing, registers the parameters every tile uses, on every tab,
 * before any tile runs. In view mode tiles report them from their own query.
 * In embeds the API client sends the embed token.
 */
export const useDashboardTileParameterReferences = ({
    store,
    projectUuid,
    isEditMode,
}: {
    store: DashboardStore;
    projectUuid: string | undefined;
    isEditMode: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const tilesKey = useSyncExternalStore(store.subscribe, () =>
        selectTileQuerySourcesKey(store.getState()),
    );
    const isEnabled =
        isEditMode &&
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
            sourceByTile[result.tileUuid] !== undefined
                ? [
                      {
                          tileUuid: result.tileUuid,
                          references: result.parameterReferences,
                          definitions: result.parameterDefinitions,
                      },
                  ]
                : [],
        );
        if (complete.length === 0) return;
        store.dispatch(
            dashboardParametersActions.addDiscoveredParameterReferences({
                references: Object.fromEntries(
                    complete.map((result) => [
                        result.tileUuid,
                        result.references,
                    ]),
                ),
                definitions: Object.assign(
                    {},
                    ...complete.map((result) => result.definitions),
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
