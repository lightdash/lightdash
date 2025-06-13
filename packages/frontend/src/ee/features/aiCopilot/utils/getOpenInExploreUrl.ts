import type { AiChartType, AnyType, MetricQuery } from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';
import { getAiAgentChartConfig } from './getAiAgentChartConfig';

export const getOpenInExploreUrl = ({
    metricQuery,
    activeProjectUuid,
    columnOrder,
    type,
    chartOptions,
    pivotColumns,
}: {
    metricQuery: MetricQuery;
    activeProjectUuid: string;
    columnOrder: string[];
    type: AiChartType;
    chartOptions?: AnyType;
    pivotColumns?: string[];
}) => {
    return getExplorerUrlFromCreateSavedChartVersion(activeProjectUuid, {
        tableName: metricQuery.exploreName,
        metricQuery,
        chartConfig: getAiAgentChartConfig({
            type,
            chartOptions,
            metricQuery,
        }),
        tableConfig: {
            columnOrder,
        },
        pivotConfig: pivotColumns
            ? {
                  columns: pivotColumns,
              }
            : undefined,
        updatedByUser: undefined,
    });
};
