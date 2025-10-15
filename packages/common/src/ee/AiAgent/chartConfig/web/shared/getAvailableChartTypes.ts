import { type MetricQuery } from '../../../../../types/metricQuery';
import { type AiAgentChartTypeOption } from '../types';

/**
 * Gets all available chart types for a query
 */
export const getAvailableChartTypes = (
    metricQuery: MetricQuery,
): AiAgentChartTypeOption[] => {
    const types: AiAgentChartTypeOption[] = ['table'];

    if (metricQuery.metrics.length > 0 && metricQuery.dimensions.length > 0) {
        types.push('bar', 'horizontal', 'line', 'scatter', 'pie', 'funnel');
    }

    return types;
};
