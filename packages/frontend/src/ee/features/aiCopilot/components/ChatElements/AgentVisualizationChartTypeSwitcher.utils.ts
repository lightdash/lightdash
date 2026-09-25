import {
    getAvailableChartTypes,
    type AiAgentChartTypeOption,
    type MetricQuery,
} from '@lightdash/common';

/** Kinds a semantic-layer answer offers: pie and funnel need a single dimension. */
export const getAgentVisualizationChartTypes = (
    metricQuery: MetricQuery,
    hasGroupByDimensions: boolean,
): AiAgentChartTypeOption[] =>
    getAvailableChartTypes(metricQuery).filter(
        (chartType) =>
            !hasGroupByDimensions ||
            (chartType !== 'pie' && chartType !== 'funnel'),
    );
