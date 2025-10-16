import { type MetricQuery } from '../../../../../types/metricQuery';
import { type AiAgentChartTypeOption } from '../types';

/**
 * Determines if a query can be rendered as a specific chart type
 */
export const canRenderAsChart = (
    chartType: AiAgentChartTypeOption,
    metricQuery: MetricQuery,
): boolean => {
    switch (chartType) {
        case 'table':
            return true; // Table can always render
        case 'bar':
        case 'horizontal':
        case 'line':
        case 'scatter':
            // Charts require at least one dimension and one metric
            return (
                metricQuery.dimensions.length > 0 &&
                metricQuery.metrics.length > 0
            );
        case 'pie':
        case 'funnel':
            // Pie and funnel charts require at least one dimension and one metric
            return (
                metricQuery.dimensions.length > 0 &&
                metricQuery.metrics.length > 0
            );
        default:
            return false;
    }
};
