import {
    getTileParameterInputs,
    getControlledKeys,
    getParameterMirror,
    getParameterControlSetter,
    isReservedParameterName,
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
    tilePicks: Record<string, ParametersValuesMap>;
};

// A cleared pick leaves each control's own value, as the saved values sit under queries
export const getParameterControlInputs = (
    controls: DashboardParameterControl[],
    picks: ParameterPicks,
    userParameterNames: string[],
    controlPicks: ParameterPicks = {},
    tilePicks: Record<string, ParametersValuesMap> = {},
): ParameterControlInputs => ({
    controls: controls.map((control) =>
        Object.hasOwn(controlPicks, control.id)
            ? { ...control, value: controlPicks[control.id] }
            : control,
    ),
    tilePicks,
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
}): Pick<DashboardTileParameterInputs, 'dashboardValues' | 'excludedKeys'> => {
    if (controlInputs === null) return { dashboardValues, excludedKeys: [] };
    const inputs = getTileParameterInputs({
        ...controlInputs,
        tileUuid,
        tileParameterReferences,
    });
    const tilePicks = controlInputs.tilePicks[tileUuid] ?? {};
    for (const [key, value] of Object.entries(tilePicks)) {
        if (
            !(
                isReservedParameterName(key) &&
                !controlInputs.userParameterNames.includes(key)
            ) &&
            !getParameterControlSetter(
                controlInputs.controls,
                key,
                tileUuid,
                controlInputs.userParameterNames,
            )
        ) {
            inputs.dashboardValues[key] = value;
            inputs.excludedKeys = inputs.excludedKeys.filter(
                (excluded) => excluded !== key,
            );
        }
    }
    return inputs;
};

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

/** A deterministic dashboard-wide context for filter option searches. */
export const getDashboardParameterOptionValues = (
    controlInputs: ParameterControlInputs | null,
    dashboardValues: ParametersValuesMap,
): ParametersValuesMap =>
    controlInputs === null
        ? dashboardValues
        : {
              ...Object.fromEntries(
                  Object.entries(
                      getParameterMirror(controlInputs.controls),
                  ).map(([key, { value }]) => [key, value]),
              ),
              ...controlInputs.overrides,
          };

/** Use a tile referencing the control's first key for its cascading options. */
export const getParameterControlOptionValues = ({
    controlInputs,
    dashboardValues,
    tileUuids,
    key,
    tileParameterReferences,
}: {
    controlInputs: ParameterControlInputs | null;
    dashboardValues: ParametersValuesMap;
    tileUuids: string[];
    key: string | undefined;
    tileParameterReferences: Record<string, string[]>;
}): ParametersValuesMap => {
    if (controlInputs === null || key === undefined) return dashboardValues;
    const tileUuid = tileUuids.find((uuid) =>
        tileParameterReferences[uuid]?.includes(key),
    );
    if (tileUuid === undefined) return dashboardValues;
    const tileInputs = getTileDashboardParameterInputs({
        controlInputs,
        tileUuid,
        tileParameterReferences,
        dashboardValues,
    });
    const controlledKeys = getControlledKeys(controlInputs.controls);
    return {
        ...Object.fromEntries(
            Object.entries(dashboardValues).filter(
                ([name]) =>
                    !controlledKeys.has(name) &&
                    !tileInputs.excludedKeys.includes(name),
            ),
        ),
        ...tileInputs.dashboardValues,
    };
};
