import {
    getExploreParameterDefinitions,
    getItemId,
    getMetricQueryParameterReferences,
    getReferencedParameterDefinitions,
    getTotalFilterRules,
    type Explore,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SemanticLayerSourceQuery,
    type ToolRunQueryAppliedParameters,
} from '@lightdash/common';

export type AppliedParametersQuery = Pick<
    SemanticLayerSourceQuery,
    'dimensions' | 'metrics' | 'filters' | 'additionalMetrics'
>;

const getQueryParameterReferences = (
    explore: Explore,
    { dimensions, metrics, filters, additionalMetrics }: AppliedParametersQuery,
): string[] => {
    const filterFieldIds = getTotalFilterRules(filters ?? {}).map(
        (rule) => rule.target.fieldId,
    );
    const usedFieldIds = new Set([...metrics, ...filterFieldIds]);
    return getMetricQueryParameterReferences(explore, {
        // Custom metrics compile from their base dimension's SQL.
        dimensions: [
            ...dimensions,
            ...(additionalMetrics ?? []).flatMap((metric) =>
                metric.baseDimensionName && usedFieldIds.has(getItemId(metric))
                    ? [
                          getItemId({
                              table: metric.table,
                              name: metric.baseDimensionName,
                          }),
                      ]
                    : [],
            ),
        ],
        metrics,
        filterFieldIds,
    });
};

export const getAppliedParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
    query: AppliedParametersQuery,
    provided: ParametersValuesMap | null,
): ToolRunQueryAppliedParameters | null => {
    const definitions = getReferencedParameterDefinitions(
        {
            ...projectParameterDefinitions,
            ...getExploreParameterDefinitions(explore),
        },
        getQueryParameterReferences(explore, query),
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
    query: AppliedParametersQuery,
    provided: ParametersValuesMap | null,
): string =>
    renderAppliedParameters(
        getAppliedParameters(
            explore,
            projectParameterDefinitions,
            query,
            provided,
        ),
    );
