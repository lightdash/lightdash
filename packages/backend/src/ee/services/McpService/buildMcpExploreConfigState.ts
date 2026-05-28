import {
    getRunQueryChartConfig,
    type CreateSavedChartVersion,
    type ItemsMap,
    type MetricQuery,
    type ToolRunQueryArgsTransformed,
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
