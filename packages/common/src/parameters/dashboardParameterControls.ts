import {
    type DashboardParameterControl,
    type ParametersValuesMap,
} from '../types/parameters';

// Whether the dashboard's value for a parameter applies to a tile.
// A parameter in no control always applies. Otherwise the first control
// holding it decides: no entry for the tile means every parameter of the
// control applies, a key means only that one, false means none.
export const isDashboardParameterSetOnTile = ({
    key,
    parameterControls,
    tileUuid,
}: {
    key: string;
    parameterControls: DashboardParameterControl[];
    tileUuid: string;
}): boolean => {
    const control = parameterControls.find((candidate) =>
        candidate.parameterKeys.includes(key),
    );
    if (control === undefined) return true;
    const target = control.tileTargets[tileUuid];
    if (target === false) return false;
    // A target left behind by a parameter the control no longer holds
    if (target === undefined || !control.parameterKeys.includes(target)) {
        return true;
    }
    return target === key;
};

// The dashboard values a tile runs with, after its parameter controls
export const getDashboardValuesForTile = ({
    dashboardValues,
    parameterControls,
    tileUuid,
}: {
    dashboardValues: ParametersValuesMap;
    parameterControls: DashboardParameterControl[];
    tileUuid: string;
}): ParametersValuesMap =>
    parameterControls.length === 0
        ? dashboardValues
        : Object.fromEntries(
              Object.entries(dashboardValues).filter(([key]) =>
                  isDashboardParameterSetOnTile({
                      key,
                      parameterControls,
                      tileUuid,
                  }),
              ),
          );
