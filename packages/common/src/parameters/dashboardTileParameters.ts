import {
    type ParameterDefinitions,
    type ParametersValuesMap,
} from '../types/parameters';
import { resolveParameterDefault } from './parameterDefaults';

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

const withoutUndefinedValues = (
    values: ParametersValuesMap,
): ParametersValuesMap =>
    Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined),
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
    ...withoutUndefinedValues(virtualViewSavedValues),
});

// Targeted: dashboard value, else chart-saved only when the definition has no default.
// Untargeted: chart-saved values only.
export const getDashboardTileParameterOverrides = ({
    definitions,
    dashboardValues,
    chartSavedValues,
    isTargeted,
}: DashboardTileParameterInputs & {
    definitions: ParameterDefinitions;
}): ParametersValuesMap => {
    if (!isTargeted) return withoutUndefinedValues(chartSavedValues);

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
            definitions[key]?.default !== undefined ||
            chartSavedValue === undefined
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
