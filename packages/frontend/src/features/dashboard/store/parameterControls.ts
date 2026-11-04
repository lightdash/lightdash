import {
    getTileParameterInputs,
    type DashboardParameterControl,
    type DashboardTileParameterInputs,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';

/** Values set by key from outside the controls; null: cleared in edit mode */
export type ParameterPicks = Record<string, ParameterValue | null>;

/** A pick by key sets every control holding the key; a control with several keys takes the first picked key's value */
export const applyParameterPicks = (
    controls: DashboardParameterControl[],
    picks: ParameterPicks,
): DashboardParameterControl[] =>
    controls.map((control) => {
        const pickedKey = Object.keys(control.parameters).find((key) =>
            Object.hasOwn(picks, key),
        );
        return pickedKey === undefined
            ? control
            : { ...control, value: picks[pickedKey] };
    });

/** The controls and the picked values, applied by key to every control holding the key */
export type ParameterControlInputs = {
    controls: DashboardParameterControl[];
    overrides: ParametersValuesMap;
    /** Keys with a user definition: a reserved name counts only as one of these */
    userParameterNames: string[];
};

// A cleared pick leaves each control's own value, as the saved values sit under queries
export const getParameterControlInputs = (
    controls: DashboardParameterControl[],
    picks: ParameterPicks,
    userParameterNames: string[],
): ParameterControlInputs => ({
    controls,
    userParameterNames,
    overrides: Object.entries(picks).reduce<ParametersValuesMap>(
        (acc, [key, value]) => {
            if (value !== null) acc[key] = value;
            return acc;
        },
        {},
    ),
});

/** Without controls (flag off), every tile takes the dashboard-wide values, as before */
export const getTileDashboardParameterInputs = ({
    controlInputs,
    tileUuid,
    tileParameterReferences,
    dashboardValues,
}: {
    controlInputs: ParameterControlInputs | null;
    tileUuid: string;
    tileParameterReferences: Record<string, string[]>;
    dashboardValues: ParametersValuesMap;
}): Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> =>
    controlInputs === null
        ? { dashboardValues, excludedKeys: [] }
        : getTileParameterInputs({
              ...controlInputs,
              tileUuid,
              tileParameterReferences,
          });

export const getDashboardExportTileParameters = ({
    controlInputs,
    tileUuids,
    tileParameterReferences,
}: {
    controlInputs: ParameterControlInputs | null;
    tileUuids: string[];
    tileParameterReferences: Record<string, string[]>;
}):
    | Record<
          string,
          { parameters: ParametersValuesMap; excludedParameterKeys: string[] }
      >
    | undefined =>
    controlInputs === null
        ? undefined
        : Object.fromEntries(
              tileUuids.map((tileUuid) => {
                  const { dashboardValues, excludedKeys } =
                      getTileDashboardParameterInputs({
                          controlInputs,
                          tileUuid,
                          tileParameterReferences,
                          dashboardValues: {},
                      });
                  return [
                      tileUuid,
                      {
                          parameters: dashboardValues,
                          excludedParameterKeys: excludedKeys,
                      },
                  ];
              }),
          );
