import {
    FeatureFlags,
    fillParameterControls,
    type DashboardConfig,
    type DashboardParameters,
} from '@lightdash/common';
import { useEffect } from 'react';
import {
    dashboardParametersActions,
    selectTileQuerySources,
    selectDashboardTiles,
    type DashboardStore,
} from '../../features/dashboard/store';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';

/**
 * With the dashboard-controls flag on, seeds the parameter controls: the saved
 * list, else one filled from the parameters the tiles use. Flag off, nothing is seeded and seeded controls are dropped.
 */
export const useSyncParameterControls = ({
    store,
    config,
    dashboardParameters,
    isDashboardLoaded,
}: {
    store: DashboardStore;
    config: DashboardConfig | undefined;
    dashboardParameters: DashboardParameters | undefined;
    isDashboardLoaded: boolean;
}) => {
    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const isEnabled = dashboardControlsFlag?.enabled === true;

    useEffect(() => {
        if (!isEnabled) {
            store.dispatch(
                dashboardParametersActions.deactivateParameterControls(),
            );
            return undefined;
        }
        if (!isDashboardLoaded) return undefined;
        // Re-seed only when what the list is built from changes; subscribing keeps the provider from re-rendering
        let lastInputs: unknown[] = [];
        const sync = () => {
            const {
                tileParameterReferences,
                tileListedParameterSources,
                parameterDefinitions,
                haveParameterControlsChanged,
            } = store.getState().parameters;
            const dashboardTiles = selectDashboardTiles(store.getState());
            const querySources = selectTileQuerySources(store.getState());
            const inputs = [
                dashboardTiles,
                querySources,
                tileParameterReferences,
                tileListedParameterSources,
                parameterDefinitions,
                haveParameterControlsChanged,
            ];
            if (inputs.every((input, index) => input === lastInputs[index])) {
                return;
            }
            lastInputs = inputs;
            if (haveParameterControlsChanged) return;
            if (
                config?.parameterControls === undefined &&
                (dashboardTiles === undefined ||
                    querySources.some(
                        (source) =>
                            tileListedParameterSources[source.tileUuid] !==
                            JSON.stringify(source),
                    ))
            ) {
                store.dispatch(
                    dashboardParametersActions.deactivateParameterControls(),
                );
                return;
            }
            store.dispatch(
                dashboardParametersActions.syncParameterControls(
                    config?.parameterControls
                        ? { controls: config.parameterControls, isSaved: true }
                        : {
                              controls: fillParameterControls({
                                  dashboardParameters:
                                      dashboardParameters ?? {},
                                  definitions: parameterDefinitions,
                                  tileParameterReferences,
                                  parameterOrder: config?.parameterOrder ?? [],
                                  // Loaded definitions are user parameters, which may shadow a reserved name
                                  userParameterNames:
                                      Object.keys(parameterDefinitions),
                              }),
                              isSaved: false,
                          },
                ),
            );
        };
        sync();
        return store.subscribe(sync);
    }, [store, isEnabled, isDashboardLoaded, config, dashboardParameters]);
};
