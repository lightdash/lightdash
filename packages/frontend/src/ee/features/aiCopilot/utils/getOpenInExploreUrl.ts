import type { ChartConfig, MetricQuery } from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';

export const getOpenInExploreUrl = ({
    metricQuery,
    projectUuid,
    columnOrder,
    pivotColumns,
    chartConfig,
}: {
    metricQuery: MetricQuery;
    projectUuid: string | undefined;
    columnOrder: string[];
    pivotColumns?: string[];
    chartConfig: ChartConfig;
}) => {
    return getExplorerUrlFromCreateSavedChartVersion(projectUuid, {
        tableName: metricQuery.exploreName,
        metricQuery,
        chartConfig,
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
