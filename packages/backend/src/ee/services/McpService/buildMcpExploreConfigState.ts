import {
    getRunQueryChartConfig,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/ai';
import {
    type CreateSavedChartVersion,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';

type McpExploreConfigState = Pick<
    CreateSavedChartVersion,
    'tableName' | 'metricQuery' | 'tableConfig' | 'chartConfig'
>;

export const buildMcpExploreConfigState = ({
    queryTool,
    metricQuery,
    fieldsMap,
    columnOrder,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    columnOrder: string[];
}): McpExploreConfigState => ({
    tableName: queryTool.queryConfig.exploreName,
    metricQuery,
    tableConfig: {
        columnOrder,
    },
    chartConfig: getRunQueryChartConfig({
        queryTool,
        metricQuery,
        fieldsMap,
    }),
});
