import {
    AiResultType,
    assertUnreachable,
    parseToolArgs,
    ToolNameSchema,
} from '@lightdash/common';
import type { FC } from 'react';
import { AiChartGenerationToolCallDescription } from '../AiChartGenerationToolCallDescription';
import type { ToolCallSummary } from '../utils/types';
import { ContentSearchToolCallDescription } from './ContentSearchToolCallDescription';
import { DashboardToolCallDescription } from './DashboardToolCallDescription';
import { ExploreToolCallDescription } from './ExploreToolCallDescription';
import { FieldSearchToolCallDescription } from './FieldSearchToolCallDescription';
import { FieldValuesSearchToolCallDescription } from './FieldValuesSearchToolCallDescription';
import { QueryResultToolCallDescription } from './QueryResultToolCallDescription';

export const ToolCallDescription: FC<{
    toolCall: ToolCallSummary;
}> = ({ toolCall }) => {
    const toolNameParsed = ToolNameSchema.safeParse(toolCall.toolName);

    if (!toolNameParsed.success) {
        console.error(
            `Failed to parse tool name ${toolCall.toolName} ${toolCall.toolCallId}`,
            toolNameParsed.error,
        );
        return null;
    }

    const toolName = toolNameParsed.data;
    const toolArgsParsed = parseToolArgs(toolName, toolCall.toolArgs);

    if (!toolArgsParsed.success) {
        console.error(
            `Failed to parse tool args for ${toolName} ${toolCall.toolCallId}`,
            toolArgsParsed.error,
        );
        return null;
    }

    const toolArgs = toolArgsParsed.data;

    switch (toolArgs.type) {
        case 'find_explores':
        case 'find_explores_v2':
        case 'find_explores_v3':
            return (
                <ExploreToolCallDescription
                    exploreName={toolArgs.exploreName}
                    searchQuery={
                        toolArgs.type === 'find_explores_v3'
                            ? toolArgs.searchQuery
                            : undefined
                    }
                />
            );
        case 'find_fields':
            return (
                <FieldSearchToolCallDescription
                    searchQueries={toolArgs.fieldSearchQueries}
                />
            );
        case 'search_field_values':
            const searchFieldValuesArgs = toolArgs;
            return (
                <FieldValuesSearchToolCallDescription
                    fieldId={searchFieldValuesArgs.fieldId}
                    query={searchFieldValuesArgs.query}
                />
            );
        case AiResultType.VERTICAL_BAR_RESULT:
            const barVizConfigToolArgs = toolArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={barVizConfigToolArgs.title}
                    dimensions={[barVizConfigToolArgs.vizConfig.xDimension]}
                    metrics={barVizConfigToolArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        barVizConfigToolArgs.vizConfig.breakdownByDimension
                    }
                />
            );
        case AiResultType.TABLE_RESULT:
            const tableVizConfigToolArgs = toolArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={tableVizConfigToolArgs.title}
                    dimensions={
                        tableVizConfigToolArgs.vizConfig.dimensions ?? []
                    }
                    metrics={tableVizConfigToolArgs.vizConfig.metrics}
                />
            );
        case AiResultType.TIME_SERIES_RESULT:
            const timeSeriesToolCallArgs = toolArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={timeSeriesToolCallArgs.title}
                    dimensions={[timeSeriesToolCallArgs.vizConfig.xDimension]}
                    metrics={timeSeriesToolCallArgs.vizConfig.yMetrics}
                    breakdownByDimension={
                        timeSeriesToolCallArgs.vizConfig.breakdownByDimension
                    }
                />
            );
        case 'find_content':
            const findContentToolArgs = toolArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="content"
                    searchQueries={findContentToolArgs.searchQueries}
                />
            );
        case 'find_dashboards':
            const findDashboardsToolArgs = toolArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="dashboards"
                    searchQueries={
                        findDashboardsToolArgs.dashboardSearchQueries
                    }
                />
            );
        case 'find_charts':
            const findChartsToolArgs = toolArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="charts"
                    searchQueries={findChartsToolArgs.chartSearchQueries}
                />
            );
        case AiResultType.DASHBOARD_RESULT:
        case AiResultType.DASHBOARD_V2_RESULT:
            const dashboardToolArgs = toolArgs;
            return (
                <DashboardToolCallDescription
                    title={dashboardToolArgs.title}
                    description={dashboardToolArgs.description}
                />
            );
        case AiResultType.QUERY_RESULT:
            const queryToolArgs = toolArgs;
            return (
                <QueryResultToolCallDescription
                    title={queryToolArgs.title}
                    queryConfig={queryToolArgs.queryConfig}
                    chartConfig={queryToolArgs.chartConfig}
                    customMetrics={queryToolArgs.customMetrics}
                    tableCalculations={queryToolArgs.tableCalculations}
                />
            );
        case AiResultType.IMPROVE_CONTEXT:
        case AiResultType.PROPOSE_CHANGE:
            return <> </>;
        default:
            return assertUnreachable(toolArgs, `Unknown tool name ${toolName}`);
    }
};
