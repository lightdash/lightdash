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
    // Keys this tile does not take from the dashboard
    untargetedKeys: string[];
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

// Targeted key: dashboard value, else chart-saved only when the definition has no default.
// Untargeted key: chart-saved value only.
export const getDashboardTileParameterOverrides = ({
    definitions,
    dashboardValues: rawDashboardValues,
    chartSavedValues: rawChartSavedValues,
    untargetedKeys,
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
    const untargeted = new Set(untargetedKeys);
    const keys = new Set([
        ...Object.keys(chartSavedValues),
        ...Object.keys(dashboardValues),
    ]);
    return [...keys].reduce<ParametersValuesMap>((acc, key) => {
        const chartSavedValue = chartSavedValues[key];
        if (untargeted.has(key)) {
            return chartSavedValue === undefined
                ? acc
                : { ...acc, [key]: chartSavedValue };
        }
        const dashboardValue = dashboardValues[key];
        if (dashboardValue !== undefined) {
            return { ...acc, [key]: dashboardValue };
        }
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
    return !inputs.untargetedKeys.includes(key) &&
        dashboardValues[key] !== undefined
        ? DashboardTileParameterSource.DASHBOARD
        : DashboardTileParameterSource.CHART;
};

export type DashboardTileParameterState = DashboardTileParameterInputs & {
    parameterReferences: string[];
};

export type DashboardParameterStatusInputs = {
    tiles: DashboardTileParameterState[];
    definitions: ParameterDefinitions;
};

// Referenced keys, paired with whether each referencing tile resolves a value with its own inputs
const getKeysResolvedPerTile = ({
    tiles,
    definitions,
}: DashboardParameterStatusInputs): Map<string, boolean[]> =>
    tiles.reduce((acc, { parameterReferences, ...inputs }) => {
        const overrides = getDashboardTileParameterOverrides({
            ...inputs,
            definitions,
        });
        new Set(parameterReferences).forEach((key) => {
            if (isReservedParameterName(key)) return;
            acc.set(key, [
                ...(acc.get(key) ?? []),
                overrides[key] !== undefined ||
                    definitions[key]?.default !== undefined,
            ]);
        });
        return acc;
    }, new Map<string, boolean[]>());

// A key is missing when any referencing tile has no dashboard value, default or chart-saved value.
export const getMissingRequiredDashboardParameters = (
    inputs: DashboardParameterStatusInputs,
): string[] =>
    [...getKeysResolvedPerTile(inputs)]
        .filter(([, resolved]) => resolved.some((has) => !has))
        .map(([key]) => key);
