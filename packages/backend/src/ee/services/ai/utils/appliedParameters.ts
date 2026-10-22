import {
    getReferencedExploreParameterDefinitions,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ToolRunQueryAppliedParameters,
} from '@lightdash/common';

export const getAppliedParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
    provided: ParametersValuesMap | null,
): ToolRunQueryAppliedParameters | null => {
    const definitions = getReferencedExploreParameterDefinitions(
        explore,
        projectParameterDefinitions,
    );
    const referenced = Object.keys(definitions);
    if (referenced.length === 0) return null;
    const applied = Object.fromEntries(
        referenced.flatMap((name) => {
            const value = provided?.[name];
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const defaulted = Object.fromEntries(
        referenced.flatMap((name) => {
            if (provided?.[name] !== undefined) return [];
            const value = definitions[name].default;
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const unset = referenced.filter(
        (name) =>
            provided?.[name] === undefined &&
            definitions[name].default === undefined,
    );
    return { applied, defaulted, unset };
};

export const renderAppliedParameters = (
    parameters: ToolRunQueryAppliedParameters | null,
): string => {
    if (parameters === null) return '';
    const { applied, defaulted, unset } = parameters;
    const parts = [
        Object.keys(applied).length > 0
            ? `set explicitly: ${JSON.stringify(applied)}`
            : null,
        Object.keys(defaulted).length > 0
            ? `resolved to defaults: ${JSON.stringify(defaulted)}`
            : null,
        unset.length > 0 ? `unset with no default: ${unset.join(', ')}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0
        ? ` Parameter values this query ran with — ${parts.join('; ')}.`
        : '';
};

// The parameter state a query actually ran with — explicit vs
// default-resolved vs unset-with-no-default — so results never hide it.
export const summarizeAppliedParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
    provided: ParametersValuesMap | null,
): string =>
    renderAppliedParameters(
        getAppliedParameters(explore, projectParameterDefinitions, provided),
    );
