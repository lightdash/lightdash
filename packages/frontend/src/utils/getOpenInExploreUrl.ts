import type {
    ChartConfig,
    MetricQuery,
    ParametersValuesMap,
} from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../hooks/useExplorerRoute';

export const getOpenInExploreUrl = ({
    metricQuery,
    projectUuid,
    columnOrder,
    pivotColumns,
    chartConfig,
    parameters,
}: {
    metricQuery: MetricQuery;
    projectUuid: string | undefined;
    columnOrder: string[];
    pivotColumns?: string[];
    chartConfig: ChartConfig;
    parameters: ParametersValuesMap | undefined;
}) => {
    return getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        {
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
            parameters,
        },
        // preserves series config in the url, e.g. y axis index, color, etc.
        true,
    );
};
