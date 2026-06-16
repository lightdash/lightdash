import type {
    DiscoverFieldsInput,
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '@lightdash/common';
import {
    assertUnreachable,
    isRunQueryArgsV1,
    migrateRunQueryArgsV1ToV2,
    type AiAgentToolResult,
    type ToolAnalyzeFieldImpactArgs,
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
    type ToolListContentArgs,
    type ToolListWarehouseTablesArgs,
    type ToolName,
    type ToolRunContentQueryArgs,
    type ToolRunQueryArgsV1,
    type ToolRunQueryArgsV2,
    type ToolRunSqlArgs,
    type ToolSearchFieldValuesArgs,
    type ToolSearchSemanticLayerArgs,
} from '@lightdash/common';
import type { FC } from 'react';
import type { ToolCallSummary } from '../utils/types';
import { AiChartGenerationToolCallDescription } from './AiChartGenerationToolCallDescription';
import { ContentEditorToolCallDescription } from './ContentEditorToolCallDescription';
import { ContentSearchToolCallDescription } from './ContentSearchToolCallDescription';
import { DashboardChartsToolCallDescription } from './DashboardChartsToolCallDescription';
import { DashboardToolCallDescription } from './DashboardToolCallDescription';
import { DescribeWarehouseTableToolCallDescription } from './DescribeWarehouseTableToolCallDescription';
import { DiscoverFieldsToolCallDescription } from './DiscoverFieldsToolCallDescription';
import { ExploreToolCallDescription } from './ExploreToolCallDescription';
import { FieldImpactToolCallDescription } from './FieldImpactToolCallDescription';
import { FieldSearchToolCallDescription } from './FieldSearchToolCallDescription';
import { FieldValuesSearchToolCallDescription } from './FieldValuesSearchToolCallDescription';
import { KnowledgeDocumentToolCallDescription } from './KnowledgeDocumentToolCallDescription';
import { ListContentToolCallDescription } from './ListContentToolCallDescription';
import { ListWarehouseTablesToolCallDescription } from './ListWarehouseTablesToolCallDescription';
import { QueryResultToolCallDescription } from './QueryResultToolCallDescription';
import { RepoShellToolCallDescription } from './RepoShellToolCallDescription';
import { RunContentQueryToolCallDescription } from './RunContentQueryToolCallDescription';
import { SemanticLayerSearchToolCallDescription } from './SemanticLayerSearchToolCallDescription';
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
        case 'discoverFields':
            const discoverFieldsArgs = toolCall.toolArgs as DiscoverFieldsInput;
            return (
                <DiscoverFieldsToolCallDescription
                    userQuery={discoverFieldsArgs.userQuery}
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
            // Persisted args may be V1 or V2; normalize to V2 so the
            // description reads everything from queryConfig.
            const rawQueryToolArgs = toolCall.toolArgs as
                | ToolRunQueryArgsV1
                | ToolRunQueryArgsV2;
            const queryToolArgs = isRunQueryArgsV1(rawQueryToolArgs)
                ? migrateRunQueryArgsV1ToV2(rawQueryToolArgs)
                : rawQueryToolArgs;
            return (
                <QueryResultToolCallDescription
                    title={queryToolArgs.title}
                    queryConfig={queryToolArgs.queryConfig}
                    chartConfig={queryToolArgs.chartConfig}
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
        case 'listContent':
            const listContentArgs = toolCall.toolArgs as ToolListContentArgs;
            return (
                <ListContentToolCallDescription
                    page={listContentArgs.page}
                    spaceSlug={listContentArgs.spaceSlug}
                />
            );
        case 'runContentQuery':
            const runContentQueryArgs =
                toolCall.toolArgs as ToolRunContentQueryArgs;
            return (
                <RunContentQueryToolCallDescription
                    source={runContentQueryArgs.source}
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
            const searchSemanticLayerArgs =
                toolCall.toolArgs as ToolSearchSemanticLayerArgs;
            return (
                <SemanticLayerSearchToolCallDescription
                    page={searchSemanticLayerArgs.page}
                    searchQuery={searchSemanticLayerArgs.searchQuery}
                    type={searchSemanticLayerArgs.type}
                />
            );
        case 'analyzeFieldImpact':
            const analyzeFieldImpactArgs =
                toolCall.toolArgs as ToolAnalyzeFieldImpactArgs;
            return (
                <FieldImpactToolCallDescription
                    fieldId={analyzeFieldImpactArgs.fieldId}
                />
            );
        case 'listKnowledgeDocuments':
        case 'listProjects':
        case 'getProjectInfo':
        case 'generateHashes':
        case 'generateUuids':
        case 'improveContext':
        case 'loadSkill':
        case 'loadProjectContext':
        case 'exploreRepo':
            const toolArgsExploreRepo = toolCall.toolArgs as {
                command?: string;
            };
            return (
                <RepoShellToolCallDescription
                    command={toolArgsExploreRepo.command ?? null}
                />
            );
        case 'discoverRepos':
        case 'proposeChange':
        case 'editDbtProject':
        case 'syncDbtProject':
        case 'setupPreviewDeploy':
        case 'runSavedChart':
        case 'readPinnedThread':
            return <> </>;
        default:
            return assertUnreachable(toolName, `Unknown tool name ${toolName}`);
    }
};
