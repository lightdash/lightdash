import type { AiChartType, AnyType, MetricQuery } from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';
import { getAiAgentChartConfig } from './getAiAgentChartConfig';

export const getOpenInExploreUrl = ({
    metricQuery,
    activeProjectUuid,
    columnOrder,
    type,
    chartOptions,
}: {
    metricQuery: MetricQuery;
    activeProjectUuid: string;
    columnOrder: string[];
    type: AiChartType;
    chartOptions?: AnyType;
}) =>
    getExplorerUrlFromCreateSavedChartVersion(activeProjectUuid, {
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
        // TODO: Add pivotConfig
        pivotConfig: undefined,
        updatedByUser: undefined,
    });
