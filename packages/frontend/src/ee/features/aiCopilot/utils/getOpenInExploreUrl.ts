import type {
    AiAgentMessageAssistant,
    AiChartType,
    AnyType,
    MetricQuery,
} from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';
import { getChartConfigFromAiAgentVizConfig } from './echarts';

export const getOpenInExploreUrl = ({
    metricQuery,
    projectUuid,
    columnOrder,
    type,
    pivotColumns,
    vizConfig,
    rows,
}: {
    metricQuery: MetricQuery;
    projectUuid: string | undefined;
    columnOrder: string[];
    type: AiChartType;
    pivotColumns?: string[];
    vizConfig: AiAgentMessageAssistant['vizConfigOutput'];
    rows: Record<string, unknown>[];
}) => {
    return getExplorerUrlFromCreateSavedChartVersion(projectUuid, {
        tableName: metricQuery.exploreName,
        metricQuery,
        chartConfig: getChartConfigFromAiAgentVizConfig({
            type,
            // TODO :: fix this using schema
            config: vizConfig as AnyType,
            metricQuery,
            rows,
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
