import {
    friendlyName,
    getItemLabelWithoutTableName,
    interpolateUiString,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import {
    getVisualizationFieldsCount,
    getVisualizationFiltersCount,
} from './AiVisualizationRenderer.utils';

export type SemanticQueryDetailsQuery = Pick<
    MetricQuery,
    'dimensions' | 'metrics' | 'filters' | 'sorts' | 'limit'
> &
    Partial<Pick<MetricQuery, 'additionalMetrics'>>;

export const semanticItemLabel = (fieldsMap: ItemsMap, fieldId: string) => {
    const item = fieldsMap[fieldId];
    return item ? getItemLabelWithoutTableName(item) : friendlyName(fieldId);
};

export type SemanticQuerySummaryOptions = {
    metricQuery: SemanticQueryDetailsQuery;
    parameters: ParametersValuesMap;
    showFields: boolean;
    showFilters: boolean;
    showSortAndLimit: boolean;
};

export type SemanticQuerySummary = {
    /** Count line, e.g. "Fields 4 · Filters 2 · 500 rows". */
    parts: string[];
    fieldsCount: number;
    filtersCount: number;
    sortsCount: number;
    parametersCount: number;
    expandable: boolean;
};

export const useSemanticQuerySummary = ({
    metricQuery,
    parameters,
    showFields,
    showFilters,
    showSortAndLimit,
}: SemanticQuerySummaryOptions): SemanticQuerySummary => {
    const getUiString = useUiStrings();
    const fieldsCount = showFields
        ? getVisualizationFieldsCount(metricQuery)
        : 0;
    const filtersCount = showFilters
        ? getVisualizationFiltersCount(metricQuery.filters)
        : 0;
    const sortsCount = showSortAndLimit ? metricQuery.sorts.length : 0;
    const parametersCount = Object.keys(parameters).length;
    const rowsKey =
        metricQuery.limit === 1
            ? 'aiAgent.queryDetails.rows.singular'
            : 'aiAgent.queryDetails.rows.plural';
    const parts = [
        fieldsCount > 0 ? `Fields ${fieldsCount}` : null,
        filtersCount > 0 ? `Filters ${filtersCount}` : null,
        sortsCount > 0
            ? interpolateUiString(
                  getUiString('aiAgent.queryDetails.sortCount'),
                  { count: sortsCount },
              )
            : null,
        parametersCount > 0 ? `Parameters ${parametersCount}` : null,
        showSortAndLimit
            ? interpolateUiString(getUiString(rowsKey), {
                  count: metricQuery.limit,
              })
            : null,
    ].filter((part) => part !== null);
    return {
        parts,
        fieldsCount,
        filtersCount,
        sortsCount,
        parametersCount,
        expandable:
            fieldsCount + filtersCount + sortsCount + parametersCount > 0,
    };
};
