import type {
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    assertUnreachable,
    type AiAgentToolResult,
    type dashboardV1Tool,
    type describeWarehouseTableTool,
    type findChartsTool,
    type findContentTool,
    type findDashboardsTool,
    type findFieldsTool,
    type getDashboardChartsTool,
    type getKnowledgeDocumentContentTool,
    type listWarehouseTablesTool,
    type runQueryTool,
    type runSqlTool,
    type searchFieldValuesTool,
    type ToolFindExploresArgs,
    type ToolInput,
    type ToolName,
    type ToolOutput,
} from '@lightdash/common';
import type { FC } from 'react';
import type { ToolCallSummary } from '../utils/types';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';
import { ContentEditorToolCallDescription } from './ContentEditorToolCallDescription';
import { ContentSearchToolCallDescription } from './ContentSearchToolCallDescription';
import { DashboardChartsToolCallDescription } from './DashboardChartsToolCallDescription';
import { DashboardToolCallDescription } from './DashboardToolCallDescription';
import { DescribeWarehouseTableToolCallDescription } from './DescribeWarehouseTableToolCallDescription';
import { ExploreToolCallDescription } from './ExploreToolCallDescription';
import { FieldSearchToolCallDescription } from './FieldSearchToolCallDescription';
import { FieldValuesSearchToolCallDescription } from './FieldValuesSearchToolCallDescription';
import { KnowledgeDocumentToolCallDescription } from './KnowledgeDocumentToolCallDescription';
import { ListWarehouseTablesToolCallDescription } from './ListWarehouseTablesToolCallDescription';
import { QueryResultToolCallDescription } from './QueryResultToolCallDescription';
import { SqlRunToolCallDescription } from './SqlRunToolCallDescription';

type ToolDashboardArgs = ToolInput<typeof dashboardV1Tool>;
type ToolDescribeWarehouseTableArgs = ToolInput<
    typeof describeWarehouseTableTool
>;
type ToolFindChartsArgs = ToolInput<typeof findChartsTool>;
type ToolFindContentArgs = ToolInput<typeof findContentTool>;
type ToolFindDashboardsArgs = ToolInput<typeof findDashboardsTool>;
type ToolFindFieldsArgs = ToolInput<typeof findFieldsTool>;
type ToolGetDashboardChartsArgs = ToolInput<typeof getDashboardChartsTool>;
type ToolGetKnowledgeDocumentContentArgs = ToolInput<
    typeof getKnowledgeDocumentContentTool
>;
type ToolGetKnowledgeDocumentContentOutput = ToolOutput<
    typeof getKnowledgeDocumentContentTool
>;
type ToolListWarehouseTablesArgs = ToolInput<typeof listWarehouseTablesTool>;
type ToolRunQueryArgs = ToolInput<typeof runQueryTool>;
type ToolRunSqlArgs = ToolInput<typeof runSqlTool>;
type ToolSearchFieldValuesArgs = ToolInput<typeof searchFieldValuesTool>;

type ContentEditorToolArgs = {
    slug?: string;
    type?: 'dashboard' | 'chart';
};

export const ToolCallDescription: FC<{
    toolName: ToolName;
    toolCall: ToolCallSummary;
    toolResult?: AiAgentToolResult;
}> = ({ toolName, toolCall }) => {
    // Mid-stream the toolArgs payload can arrive before any input chunks have
    // been parsed. Casting an undefined value and reading fields throws, so
    // bail until args exist.
    if (!toolCall.toolArgs || typeof toolCall.toolArgs !== 'object') {
        return <> </>;
    }
    switch (toolName) {
        case 'findExplores':
            const toolArgsFindExplores =
                toolCall.toolArgs as ToolFindExploresArgs;
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
            return (
                <SqlRunToolCallDescription
                    sql={sqlToolArgs.sql}
                    limit={sqlToolArgs.limit}
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
        case 'getKnowledgeDocumentContent':
            const getKnowledgeDocumentContentArgs =
                toolCall.toolArgs as ToolGetKnowledgeDocumentContentArgs;
            const knowledgeDocumentOutput = toolCall.toolOutput as
                | ToolGetKnowledgeDocumentContentOutput
                | undefined;
            return (
                <KnowledgeDocumentToolCallDescription
                    documentUuid={getKnowledgeDocumentContentArgs.documentUuid}
                    toolOutput={knowledgeDocumentOutput}
                />
            );
        case 'listKnowledgeDocuments':
        case 'discoverFields':
        case 'generateUuids':
        case 'improveContext':
        case 'loadSkill':
        case 'proposeChange':
        case 'runSavedChart':
            return <> </>;
        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};
