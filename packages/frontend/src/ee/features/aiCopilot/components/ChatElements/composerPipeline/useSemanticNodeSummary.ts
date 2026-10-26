import {
    friendlyName,
    getItemLabelWithoutTableName,
    interpolateUiString,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type UiStringKey,
} from '@lightdash/common';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import {
    getVisualizationFieldsCount,
    getVisualizationFiltersCount,
} from '../AiVisualizationRenderer.utils';

export type SemanticNodeQuery = Pick<
    MetricQuery,
    'dimensions' | 'metrics' | 'filters' | 'sorts' | 'limit'
>;

export const semanticItemLabel = (fieldsMap: ItemsMap, fieldId: string) => {
    const item = fieldsMap[fieldId];
    return item ? getItemLabelWithoutTableName(item) : friendlyName(fieldId);
};

/** Count line parts, e.g. ["Fields 4", "Filters 2", "500 rows"]. */
export const useSemanticNodeSummary = (
    metricQuery: SemanticNodeQuery,
    parameters: ParametersValuesMap,
): string[] => {
    const getUiString = useUiStrings();
    const count = (key: UiStringKey, value: number) =>
        interpolateUiString(getUiString(key), { count: value });
    const fieldsCount = getVisualizationFieldsCount(metricQuery);
    const filtersCount = getVisualizationFiltersCount(metricQuery.filters);
    const sortsCount = metricQuery.sorts.length;
    const parametersCount = Object.keys(parameters).length;
    const rowsKey =
        metricQuery.limit === 1
            ? 'aiAgent.composer.semanticNode.rows.singular'
            : 'aiAgent.composer.semanticNode.rows.plural';
    return [
        fieldsCount > 0
            ? count('aiAgent.composer.semanticNode.fieldsCount', fieldsCount)
            : null,
        filtersCount > 0
            ? count('aiAgent.composer.semanticNode.filtersCount', filtersCount)
            : null,
        sortsCount > 0
            ? count('aiAgent.composer.semanticNode.sortCount', sortsCount)
            : null,
        parametersCount > 0
            ? count(
                  'aiAgent.composer.semanticNode.parametersCount',
                  parametersCount,
              )
            : null,
        count(rowsKey, metricQuery.limit),
    ].filter((part) => part !== null);
};
