import type {
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    assertUnreachable,
    type AiAgentToolResult,
    type ToolDashboardArgs,
    type ToolDescribeWarehouseTableArgs,
    type ToolFindChartsArgs,
    type ToolFindContentArgs,
    type ToolFindDashboardsArgs,
    type ToolFindExploresArgsV1,
    type ToolFindExploresArgsV2,
    type ToolFindExploresArgsV3,
    type ToolFindFieldsArgs,
    type ToolGetDashboardChartsArgs,
    type ToolListWarehouseTablesArgs,
    type ToolName,
    type ToolRunQueryArgs,
    type ToolRunSqlArgs,
    type ToolSearchFieldValuesArgs,
} from '@lightdash/common';
import type { FC } from 'react';
import type { ToolCallArtifactContext, ToolCallSummary } from '../utils/types';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';
import { ContentEditorToolCallDescription } from './ContentEditorToolCallDescription';
import { ContentSearchToolCallDescription } from './ContentSearchToolCallDescription';
import { DashboardChartsToolCallDescription } from './DashboardChartsToolCallDescription';
import { DashboardToolCallDescription } from './DashboardToolCallDescription';
import { DescribeWarehouseTableToolCallDescription } from './DescribeWarehouseTableToolCallDescription';
import { ExploreToolCallDescription } from './ExploreToolCallDescription';
import { FieldSearchToolCallDescription } from './FieldSearchToolCallDescription';
import { FieldValuesSearchToolCallDescription } from './FieldValuesSearchToolCallDescription';
import { ListWarehouseTablesToolCallDescription } from './ListWarehouseTablesToolCallDescription';
import { QueryResultToolCallDescription } from './QueryResultToolCallDescription';
import { SqlRunToolCallDescription } from './SqlRunToolCallDescription';

type ContentEditorToolArgs = {
    slug?: string;
    type?: 'dashboard' | 'chart';
};

const getToolStatus = (
    toolCall: ToolCallSummary,
    toolResult: AiAgentToolResult | undefined,
) => {
    const metadata =
        toolResult?.metadata ??
        (toolCall.toolOutput as { metadata?: unknown } | undefined)?.metadata;

    if (!metadata || typeof metadata !== 'object' || !('status' in metadata)) {
        return undefined;
    }

    const status = (metadata as { status?: unknown }).status;
    return typeof status === 'string' ? status : undefined;
};

export const ToolCallDescription: FC<{
    toolName: ToolName;
    toolCall: ToolCallSummary;
    artifactContext?: ToolCallArtifactContext;
    toolResult?: AiAgentToolResult;
}> = ({ toolName, toolCall, artifactContext, toolResult }) => {
    // Mid-stream the toolArgs payload can arrive before any input chunks have
    // been parsed. Casting an undefined value and reading fields throws, so
    // bail until args exist.
    if (!toolCall.toolArgs || typeof toolCall.toolArgs !== 'object') {
        return <> </>;
    }
    switch (toolName) {
        case 'findExplores':
            const toolArgsFindExplores = toolCall.toolArgs as
                | ToolFindExploresArgsV3
                | ToolFindExploresArgsV2
                | ToolFindExploresArgsV1;
            return (
                <ExploreToolCallDescription
                    exploreName={
                        'exploreName' in toolArgsFindExplores
                            ? toolArgsFindExplores.exploreName
                            : null
                    }
                    searchQuery={
                        'searchQuery' in toolArgsFindExplores
                            ? toolArgsFindExplores.searchQuery
                            : null
                    }
                />
            );
        case 'findFields':
            const toolArgsFindFields = toolCall.toolArgs as ToolFindFieldsArgs;
            return (
                <FieldSearchToolCallDescription
                    searchQueries={toolArgsFindFields.fieldSearchQueries}
                />
            );
        case 'searchFieldValues':
            const searchFieldValuesArgs =
                toolCall.toolArgs as ToolSearchFieldValuesArgs;
            return (
                <FieldValuesSearchToolCallDescription
                    fieldId={searchFieldValuesArgs.fieldId}
                    query={searchFieldValuesArgs.query}
                />
            );
        case 'findContent':
            const findContentToolArgs =
                toolCall.toolArgs as ToolFindContentArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="content"
                    searchQueries={findContentToolArgs.searchQueries}
                />
            );
        case 'findDashboards':
            const findDashboardsToolArgs =
                toolCall.toolArgs as ToolFindDashboardsArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="dashboards"
                    searchQueries={
                        findDashboardsToolArgs.dashboardSearchQueries
                    }
                />
            );
        case 'findCharts':
            const findChartsToolArgs = toolCall.toolArgs as ToolFindChartsArgs;
            return (
                <ContentSearchToolCallDescription
                    searchType="charts"
                    searchQueries={findChartsToolArgs.chartSearchQueries}
                />
            );
        case 'getDashboardCharts':
            const getDashboardChartsArgs =
                toolCall.toolArgs as ToolGetDashboardChartsArgs;
            return (
                <DashboardChartsToolCallDescription
                    dashboardName={
                        getDashboardChartsArgs.dashboardName ??
                        getDashboardChartsArgs.dashboardUuid
                    }
                    page={getDashboardChartsArgs.page ?? null}
                />
            );
        case 'generateDashboard':
            const dashboardToolArgs = toolCall.toolArgs as ToolDashboardArgs;
            return (
                <DashboardToolCallDescription
                    title={dashboardToolArgs.title}
                    description={dashboardToolArgs.description}
                />
            );
        case 'runQuery':
            const queryToolArgs = toolCall.toolArgs as ToolRunQueryArgs;
            return (
                <QueryResultToolCallDescription
                    title={queryToolArgs.title}
                    queryConfig={queryToolArgs.queryConfig}
                    chartConfig={queryToolArgs.chartConfig}
                    customMetrics={queryToolArgs.customMetrics}
                    tableCalculations={queryToolArgs.tableCalculations}
                />
            );
        case 'generateBarVizConfig':
        case 'generateTableVizConfig':
        case 'generateTimeSeriesVizConfig':
            const chartToolArgs = toolCall.toolArgs as
                | ToolTableVizArgs
                | ToolTimeSeriesArgs
                | ToolVerticalBarArgs;
            return (
                <AiChartGenerationToolCallDescription
                    title={chartToolArgs.title}
                />
            );
        case 'runSql':
            const sqlToolArgs = toolCall.toolArgs as ToolRunSqlArgs;
            const sqlStatus = getToolStatus(toolCall, toolResult);
            return (
                <SqlRunToolCallDescription
                    sql={sqlToolArgs.sql}
                    limit={sqlToolArgs.limit}
                    title={sqlToolArgs.title}
                    description={sqlToolArgs.description}
                    artifactContext={artifactContext}
                    isSuccessful={
                        sqlStatus === 'success' &&
                        toolCall.isPreliminary !== true
                    }
                />
            );
        case 'readContent':
        case 'editContent':
            const contentEditorToolArgs =
                toolCall.toolArgs as ContentEditorToolArgs;
            return contentEditorToolArgs.slug && contentEditorToolArgs.type ? (
                <ContentEditorToolCallDescription
                    action={toolName === 'readContent' ? 'read' : 'edit'}
                    slug={contentEditorToolArgs.slug}
                    type={contentEditorToolArgs.type}
                />
            ) : (
                <> </>
            );
        case 'listWarehouseTables':
            const listWarehouseTablesArgs =
                toolCall.toolArgs as ToolListWarehouseTablesArgs;
            return (
                <ListWarehouseTablesToolCallDescription
                    schema={listWarehouseTablesArgs.schema ?? null}
                    search={listWarehouseTablesArgs.search ?? null}
                />
            );
        case 'describeWarehouseTable':
            const describeWarehouseTableArgs =
                toolCall.toolArgs as ToolDescribeWarehouseTableArgs;
            return (
                <DescribeWarehouseTableToolCallDescription
                    table={describeWarehouseTableArgs.table}
                    schema={describeWarehouseTableArgs.schema ?? null}
                />
            );
        case 'listKnowledgeDocuments':
        case 'getKnowledgeDocumentContent':
        case 'discoverFields':
        case 'improveContext':
        case 'loadSkill':
        case 'proposeChange':
        case 'runSavedChart':
            return <> </>;
        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};
