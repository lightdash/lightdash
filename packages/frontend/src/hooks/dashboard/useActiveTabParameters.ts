import {
    type DashboardTile,
    type ParameterDefinitions,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

export const getActiveTabParameters = ({
    activeTiles,
    parameterDefinitions,
    tileParameterReferences,
    dashboardParameterReferences,
}: {
    activeTiles: DashboardTile[] | undefined;
    parameterDefinitions: ParameterDefinitions;
    tileParameterReferences: Record<string, string[]>;
    dashboardParameterReferences: Set<string>;
}): ParameterDefinitions => {
    const activeReferences = activeTiles
        ? new Set(
              activeTiles.flatMap(
                  (tile) => tileParameterReferences[tile.uuid] ?? [],
              ),
          )
        : dashboardParameterReferences;

    return Object.fromEntries(
        Object.entries(parameterDefinitions).filter(([key]) =>
            activeReferences.has(key),
        ),
    );
};

/**
 * Parameters referenced by the tiles currently visible on the dashboard, so a
 * parameter is only shown on the tabs whose charts actually use it. Falls back
 * to every referenced parameter while the visible tiles are unknown.
 */
export const useActiveTabParameters = (
    activeTiles: DashboardTile[] | undefined,
): ParameterDefinitions => {
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardParameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

    return useMemo(
        () =>
            getActiveTabParameters({
                activeTiles,
                parameterDefinitions,
                tileParameterReferences,
                dashboardParameterReferences,
            }),
        [
            activeTiles,
            dashboardParameterReferences,
            parameterDefinitions,
            tileParameterReferences,
        ],
    );
};
