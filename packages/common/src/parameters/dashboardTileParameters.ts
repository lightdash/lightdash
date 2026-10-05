import {
    type DashboardParameterControl,
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '../types/parameters';
import { resolveParameterDefault } from './parameterDefaults';
import { omitDisallowedParameterValues } from './parameterOptions';
import { isReservedParameterName } from './reservedParameters';

// Project defaults < explore defaults < virtual-view saved values
export type ParameterFallbackSources = {
    projectDefinitions: ParameterDefinitions;
    exploreDefinitions: ParameterDefinitions;
    virtualViewSavedValues: ParametersValuesMap;
    now: Date;
    timezone: string | null;
};

export type DashboardTileParameterInputs = {
    dashboardValues: ParametersValuesMap;
    chartSavedValues: ParametersValuesMap;
    isTargeted: boolean;
    // Keys this tile keeps for itself while taking the rest from the dashboard
    takenOutKeys?: string[];
};

// Keys of the controls this tile is taken out of; they resolve like an untargeted tile's.
export const getTakenOutParameterKeys = (
    parameterControls: DashboardParameterControl[] | undefined,
    tileUuid: string,
): string[] => [
    ...new Set(
        (parameterControls ?? [])
            .filter((control) => control.tileTargets[tileUuid] === false)
            .flatMap((control) => control.parameterKeys),
    ),
];

// Dashboard-level values a tile may read: none of the keys it is taken out of.
export const omitTakenOutParameterValues = (
    values: ParametersValuesMap,
    takenOutKeys: string[],
): ParametersValuesMap =>
    takenOutKeys.length === 0
        ? values
        : Object.fromEntries(
              Object.entries(values).filter(
                  ([key]) => !takenOutKeys.includes(key),
              ),
          );

// What a tile runs with for a key it is taken out of: the chart's own saved
// value, else the definition's default. The server resolves a saved take-out
// the same way.
export const resolveTakenOutParameterValue = ({
    key,
    chartSavedValues,
    definitions,
}: {
    key: string;
    chartSavedValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
}): ParametersValuesMap[string] | undefined => {
    const ownValue = chartSavedValues[key];
    if (ownValue !== undefined) return ownValue;
    const definition = definitions[key];
    return definition ? resolveParameterDefault(definition) : undefined;
};

// The dashboard parameter values a tile's request carries. Keys the tile is
// taken out of are left out: the server resolves a saved take-out itself. A
// take-out the server does not know yet (unsaved, or a previewed draft) would
// be resolved from the dashboard's saved value instead, so the request
// carries the value the tile should run with, when there is one.
export const getDashboardTileRequestParameters = ({
    dashboardValues,
    chartSavedValues,
    definitions,
    takenOutKeys,
    savedTakenOutKeys,
}: {
    dashboardValues: ParametersValuesMap;
    chartSavedValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
    // From the controls as they are on screen
    takenOutKeys: string[];
    // From the controls as they are saved
    savedTakenOutKeys: string[];
}): ParametersValuesMap => {
    const kept = omitTakenOutParameterValues(dashboardValues, takenOutKeys);
    return takenOutKeys
        .filter((key) => !savedTakenOutKeys.includes(key))
        .reduce<ParametersValuesMap>((acc, key) => {
            const value = resolveTakenOutParameterValue({
                key,
                chartSavedValues,
                definitions,
            });
            return value === undefined ? acc : { ...acc, [key]: value };
        }, kept);
};

// Keys a tile is taken out of as far as its query goes: the take-outs on
// screen, and the saved ones the server keeps applying until the next save
export const getEffectiveTakenOutParameterKeys = ({
    takenOutKeys,
    savedTakenOutKeys,
}: {
    takenOutKeys: string[];
    savedTakenOutKeys: string[];
}): string[] => [...new Set([...takenOutKeys, ...savedTakenOutKeys])];

const resolveDefinitionDefaults = (
    definitions: ParameterDefinitions,
    now: Date,
    timezone: string | null,
): ParametersValuesMap =>
    Object.entries(definitions).reduce<ParametersValuesMap>(
        (acc, [key, definition]) => {
            const value = resolveParameterDefault(
                definition,
                now,
                timezone ?? undefined,
            );
            return value === undefined ? acc : { ...acc, [key]: value };
        },
        {},
    );

export const getEffectiveParameterDefinitions = ({
    projectDefinitions,
    exploreDefinitions,
}: Pick<
    ParameterFallbackSources,
    'projectDefinitions' | 'exploreDefinitions'
>): ParameterDefinitions => ({
    ...projectDefinitions,
    ...exploreDefinitions,
});

export const resolveFallbackParameterValues = ({
    projectDefinitions,
    exploreDefinitions,
    virtualViewSavedValues,
    now,
    timezone,
}: ParameterFallbackSources): ParametersValuesMap => ({
    ...resolveDefinitionDefaults(projectDefinitions, now, timezone),
    ...resolveDefinitionDefaults(exploreDefinitions, now, timezone),
    ...omitDisallowedParameterValues(
        virtualViewSavedValues,
        getEffectiveParameterDefinitions({
            projectDefinitions,
            exploreDefinitions,
        }),
    ),
});

// A chart's saved value applies only when the dashboard has no value and the definition no default
export const canUseChartSavedParameterValue = ({
    key,
    dashboardValues,
    definitions,
}: {
    key: string;
    dashboardValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
}): boolean =>
    dashboardValues[key] === undefined &&
    definitions[key]?.default === undefined;

// Targeted: dashboard value, else chart-saved only when the definition has no default.
// Untargeted tile or taken-out key: chart-saved value only.
export const getDashboardTileParameterOverrides = ({
    definitions,
    dashboardValues: rawDashboardValues,
    chartSavedValues: rawChartSavedValues,
    isTargeted,
    takenOutKeys = [],
}: DashboardTileParameterInputs & {
    definitions: ParameterDefinitions;
}): ParametersValuesMap => {
    // Values outside a parameter's fixed options count as unset
    const dashboardValues = omitDisallowedParameterValues(
        rawDashboardValues,
        definitions,
    );
    const chartSavedValues = omitDisallowedParameterValues(
        rawChartSavedValues,
        definitions,
    );
    if (!isTargeted) return chartSavedValues;

    const keys = new Set([
        ...Object.keys(chartSavedValues),
        ...Object.keys(dashboardValues),
    ]);
    return [...keys].reduce<ParametersValuesMap>((acc, key) => {
        if (takenOutKeys.includes(key)) {
            const ownValue = chartSavedValues[key];
            return ownValue === undefined ? acc : { ...acc, [key]: ownValue };
        }
        const dashboardValue = dashboardValues[key];
        if (dashboardValue !== undefined) {
            return { ...acc, [key]: dashboardValue };
        }
        const chartSavedValue = chartSavedValues[key];
        if (
            chartSavedValue === undefined ||
            !canUseChartSavedParameterValue({
                key,
                dashboardValues,
                definitions,
            })
        ) {
            return acc;
        }
        return { ...acc, [key]: chartSavedValue };
    }, {});
};

export const resolveDashboardTileParameters = ({
    fallbackSources,
    ...inputs
}: DashboardTileParameterInputs & {
    fallbackSources: ParameterFallbackSources;
}): ParametersValuesMap => ({
    ...resolveFallbackParameterValues(fallbackSources),
    ...getDashboardTileParameterOverrides({
        ...inputs,
        definitions: getEffectiveParameterDefinitions(fallbackSources),
    }),
});

export enum DashboardTileParameterSource {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    DEFAULT = 'default',
}

// Where a tile's value for one parameter comes from; default covers the whole fallback chain.
export const getDashboardTileParameterSource = ({
    key,
    ...inputs
}: DashboardTileParameterInputs & {
    key: string;
    definitions: ParameterDefinitions;
}): DashboardTileParameterSource => {
    if (getDashboardTileParameterOverrides(inputs)[key] === undefined) {
        return DashboardTileParameterSource.DEFAULT;
    }
    const dashboardValues = omitDisallowedParameterValues(
        inputs.dashboardValues,
        inputs.definitions,
    );
    return inputs.isTargeted &&
        !inputs.takenOutKeys?.includes(key) &&
        dashboardValues[key] !== undefined
        ? DashboardTileParameterSource.DASHBOARD
        : DashboardTileParameterSource.CHART;
};

export type DashboardTileParameterState = {
    parameterReferences: string[];
    chartSavedValues: ParametersValuesMap;
    // Keys this tile is taken out of, so dashboard values do not resolve them
    takenOutKeys?: string[];
};

export type DashboardParameterStatusInputs = {
    tiles: DashboardTileParameterState[];
    dashboardValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
};

// Referenced keys a tile gets no dashboard value or definition default for, paired with
// whether each referencing tile has a chart-saved value for them.
const getKeysResolvedPerTile = ({
    tiles,
    dashboardValues: rawDashboardValues,
    definitions,
}: DashboardParameterStatusInputs): Map<string, boolean[]> => {
    const dashboardValues = omitDisallowedParameterValues(
        rawDashboardValues,
        definitions,
    );
    return tiles.reduce((acc, tile) => {
        const chartSavedValues = omitDisallowedParameterValues(
            tile.chartSavedValues,
            definitions,
        );
        new Set(tile.parameterReferences).forEach((key) => {
            if (
                isReservedParameterName(key) ||
                !canUseChartSavedParameterValue({
                    key,
                    dashboardValues: tile.takenOutKeys?.includes(key)
                        ? {}
                        : dashboardValues,
                    definitions,
                })
            ) {
                return;
            }
            acc.set(key, [
                ...(acc.get(key) ?? []),
                chartSavedValues[key] !== undefined,
            ]);
        });
        return acc;
    }, new Map<string, boolean[]>());
};

// A key is missing when any referencing tile has no dashboard value (or is taken out of it), default or chart-saved value.
export const getMissingRequiredDashboardParameters = (
    inputs: DashboardParameterStatusInputs,
): string[] =>
    [...getKeysResolvedPerTile(inputs)]
        .filter(([, hasChartValues]) => hasChartValues.some((has) => !has))
        .map(([key]) => key);
