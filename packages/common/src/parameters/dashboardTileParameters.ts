import {
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
};

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
// Untargeted: chart-saved values only.
export const getDashboardTileParameterOverrides = ({
    definitions,
    dashboardValues: rawDashboardValues,
    chartSavedValues: rawChartSavedValues,
    isTargeted,
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
    return inputs.isTargeted && dashboardValues[key] !== undefined
        ? DashboardTileParameterSource.DASHBOARD
        : DashboardTileParameterSource.CHART;
};

export type DashboardTileParameterState = {
    parameterReferences: string[];
    chartSavedValues: ParametersValuesMap;
};

export type DashboardParameterStatusInputs = {
    tiles: DashboardTileParameterState[];
    dashboardValues: ParametersValuesMap;
    definitions: ParameterDefinitions;
};

// Referenced keys with no dashboard value and no definition default, paired with
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
                    dashboardValues,
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

// A key is missing when any referencing tile has no dashboard value, default or chart-saved value.
export const getMissingRequiredDashboardParameters = (
    inputs: DashboardParameterStatusInputs,
): string[] =>
    [...getKeysResolvedPerTile(inputs)]
        .filter(([, hasChartValues]) => hasChartValues.some((has) => !has))
        .map(([key]) => key);
