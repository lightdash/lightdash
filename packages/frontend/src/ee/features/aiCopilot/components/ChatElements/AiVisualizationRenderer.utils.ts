import {
    AiResultType,
    countTotalFilterRules,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';

export const shouldDisplayMetricsAndDimensions = (resultType: AiResultType) =>
    resultType !== AiResultType.TABLE_RESULT;

export const getVisualizationFieldsCount = (
    metricQuery: Pick<MetricQuery, 'dimensions' | 'metrics'>,
) => metricQuery.dimensions.length + metricQuery.metrics.length;

export const getVisualizationFiltersCount = (filters: Filters) =>
    countTotalFilterRules(filters);

export const shouldDisplayVisualizationFilters = (filters: Filters) =>
    getVisualizationFiltersCount(filters) > 0;
