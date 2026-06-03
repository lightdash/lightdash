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
    type ToolGetKnowledgeDocumentContentArgs,
    type ToolGetKnowledgeDocumentContentOutput,
    type ToolListWarehouseTablesArgs,
    type ToolName,
    type ToolRunQueryArgs,
    type ToolRunSqlArgs,
    type ToolSearchFieldValuesArgs,
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

type ToolReadContentArgs = {
    slug?: string;
    type?: 'dashboard' | 'chart';
};

type ToolEditContentArgs = {
    slug?: string;
    type?: 'dashboard' | 'chart';
};

type ToolCreateContentArgs = {
    content?: { slug?: string };
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
        case 'generateVisualization':
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
            const readContentToolArgs =
                toolCall.toolArgs as ToolReadContentArgs;
            return readContentToolArgs.slug && readContentToolArgs.type ? (
                <ContentEditorToolCallDescription
                    action="read"
                    slug={readContentToolArgs.slug}
                    type={readContentToolArgs.type}
                />
            ) : (
                <> </>
            );
        case 'editContent':
            const editContentToolArgs =
                toolCall.toolArgs as ToolEditContentArgs;
            return editContentToolArgs.slug && editContentToolArgs.type ? (
                <ContentEditorToolCallDescription
                    action="edit"
                    slug={editContentToolArgs.slug}
                    type={editContentToolArgs.type}
                />
            ) : (
                <> </>
            );
        case 'createContent':
            const createContentToolArgs =
                toolCall.toolArgs as ToolCreateContentArgs;
            return createContentToolArgs.content?.slug &&
                createContentToolArgs.type ? (
                <ContentEditorToolCallDescription
                    action="create"
                    slug={createContentToolArgs.content.slug}
                    type={createContentToolArgs.type}
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
        case 'searchSemanticLayer':
        case 'listKnowledgeDocuments':
        case 'listProjects':
        case 'getProjectInfo':
        case 'listContent':
        case 'discoverFields':
        case 'generateHashes':
        case 'generateUuids':
        case 'improveContext':
        case 'loadSkill':
        case 'loadProjectContext':
        case 'proposeChange':
        case 'proposeWriteback':
        case 'runContentQuery':
        case 'setupPreviewDeploy':
        case 'runSavedChart':
            return <> </>;
        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};
