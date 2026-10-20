import type {
    DiscoverFieldsInput,
    ReadContentType,
    ToolGrepFieldsArgs,
    ToolGetMetadataArgs,
} from '@lightdash/common';
import {
    getPatchedSql,
    isRunQueryArgsV1,
    migrateRunQueryArgsV1ToV2,
    type AiAgentToolResult,
    type ToolAnalyzeFieldImpactArgs,
    type ToolComposerQueriesArgs,
    type ToolCreateScheduledDeliveryOutput,
    type ToolLoadSkillArgs,
    type ToolLoadSkillOutput,
    type ToolDashboardV2Args,
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
import type { FC, ReactNode } from 'react';
import { type ComposerQueryNodeStatus } from '../../composerNodeStatus';
import { type SqlApprovalTarget } from '../SqlApprovalActions';
import type { ToolCallSummary } from '../utils/types';
import { ComposerQueriesToolCallDescription } from './ComposerQueriesToolCallDescription';
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
import { GetMetadataToolCallDescription } from './GetMetadataToolCallDescription';
import { GrepFieldsToolCallDescription } from './GrepFieldsToolCallDescription';
import { KnowledgeDocumentToolCallDescription } from './KnowledgeDocumentToolCallDescription';
import { ListContentToolCallDescription } from './ListContentToolCallDescription';
import { ListWarehouseTablesToolCallDescription } from './ListWarehouseTablesToolCallDescription';
import { LoadSkillToolCallDescription } from './LoadSkillToolCallDescription';
import { QueryResultToolCallDescription } from './QueryResultToolCallDescription';
import { RepoShellToolCallDescription } from './RepoShellToolCallDescription';
import { RunContentQueryToolCallDescription } from './RunContentQueryToolCallDescription';
import { ScheduledDeliveryToolCallDescription } from './ScheduledDeliveryToolCallDescription';
import { SemanticLayerSearchToolCallDescription } from './SemanticLayerSearchToolCallDescription';
import {
    SqlChartToolCallDescription,
    type SqlChartToolArgs,
} from './SqlChartToolCallDescription';
import { SqlRunToolCallDescription } from './SqlRunToolCallDescription';

type ToolReadContentArgs = {
    slug?: string;
    documentUuid?: string;
    type?: ReadContentType | 'document';
};

type ToolEditContentArgs = {
    slug?: string;
    type?: 'dashboard' | 'chart' | 'sql_chart' | 'document';
    patch?: unknown;
};

type ToolCreateContentArgs = {
    content?: { slug?: string } & SqlChartToolArgs;
    type?: 'dashboard' | 'chart' | 'sql_chart' | 'document';
};

type ToolCallDescriptionContext = {
    toolCall: ToolCallSummary;
    toolResult?: AiAgentToolResult;
    composerNodeStatuses?: Record<string, ComposerQueryNodeStatus>;
    approval?: SqlApprovalTarget;
};

type ToolCallDescriptionHandler = (
    ctx: ToolCallDescriptionContext,
) => ReactNode;

const emptyToolCallDescription: ToolCallDescriptionHandler = () => <> </>;

const repoShellToolCallDescription: ToolCallDescriptionHandler = ({
    toolCall,
}) => {
    const toolArgsExploreRepo = toolCall.toolArgs as {
        command?: string;
    };
    return (
        <RepoShellToolCallDescription
            command={toolArgsExploreRepo.command ?? null}
        />
    );
};

const queryResultToolCallDescription: ToolCallDescriptionHandler = ({
    toolCall,
}) => {
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
};

/**
 * Per-tool activity descriptions. Same case bodies as the previous switch;
 * tools that rendered an empty fragment still do. `Record<ToolName, …>`
 * is the exhaustiveness check that used to live in the switch default.
 */
const DESCRIPTION_BY_TOOL: Record<ToolName, ToolCallDescriptionHandler> = {
    findExplores: ({ toolCall }) => {
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
    },
    findFields: ({ toolCall }) => {
        const toolArgsFindFields = toolCall.toolArgs as ToolFindFieldsArgs;
        return (
            <FieldSearchToolCallDescription
                searchQueries={toolArgsFindFields.fieldSearchQueries}
            />
        );
    },
    discoverFields: ({ toolCall }) => {
        const discoverFieldsArgs = toolCall.toolArgs as DiscoverFieldsInput;
        return (
            <DiscoverFieldsToolCallDescription
                userQuery={discoverFieldsArgs.userQuery}
            />
        );
    },
    grepFields: ({ toolCall }) => {
        const grepFieldsArgs = toolCall.toolArgs as ToolGrepFieldsArgs;
        return (
            <GrepFieldsToolCallDescription
                patterns={grepFieldsArgs.patterns ?? []}
                exploreName={grepFieldsArgs.exploreName}
            />
        );
    },
    getMetadata: ({ toolCall }) => {
        const getMetadataArgs = toolCall.toolArgs as ToolGetMetadataArgs;
        return (
            <GetMetadataToolCallDescription
                requests={getMetadataArgs.requests ?? []}
            />
        );
    },
    searchFieldValues: ({ toolCall }) => {
        const searchFieldValuesArgs =
            toolCall.toolArgs as ToolSearchFieldValuesArgs;
        return (
            <FieldValuesSearchToolCallDescription
                fieldId={searchFieldValuesArgs.fieldId}
                query={searchFieldValuesArgs.query}
            />
        );
    },
    findContent: ({ toolCall }) => {
        const findContentToolArgs = toolCall.toolArgs as ToolFindContentArgs;
        return (
            <ContentSearchToolCallDescription
                searchType="content"
                searchQueries={findContentToolArgs.searchQueries}
            />
        );
    },
    findDashboards: ({ toolCall }) => {
        const findDashboardsToolArgs =
            toolCall.toolArgs as ToolFindDashboardsArgs;
        return (
            <ContentSearchToolCallDescription
                searchType="dashboards"
                searchQueries={findDashboardsToolArgs.dashboardSearchQueries}
            />
        );
    },
    findCharts: ({ toolCall }) => {
        const findChartsToolArgs = toolCall.toolArgs as ToolFindChartsArgs;
        return (
            <ContentSearchToolCallDescription
                searchType="charts"
                searchQueries={findChartsToolArgs.chartSearchQueries}
            />
        );
    },
    getDashboardCharts: ({ toolCall }) => {
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
    },
    generateDashboard: ({ toolCall }) => {
        const dashboardToolArgs = toolCall.toolArgs as ToolDashboardV2Args;
        return (
            <DashboardToolCallDescription
                title={dashboardToolArgs.title}
                description={dashboardToolArgs.description}
            />
        );
    },
    generateVisualization: queryResultToolCallDescription,
    runQuery: queryResultToolCallDescription,
    runSql: ({ toolCall, approval }) => {
        const sqlToolArgs = toolCall.toolArgs as ToolRunSqlArgs;
        return (
            <SqlRunToolCallDescription
                sql={sqlToolArgs.sql}
                limit={sqlToolArgs.limit}
                approval={approval}
            />
        );
    },
    runComposerQueries: ({ toolCall, composerNodeStatuses, approval }) => {
        const composerToolArgs = toolCall.toolArgs as ToolComposerQueriesArgs;
        return (
            <ComposerQueriesToolCallDescription
                queries={composerToolArgs.queries ?? []}
                nodeStatuses={composerNodeStatuses}
                approval={approval}
            />
        );
    },
    readContent: ({ toolCall }) => {
        const readContentToolArgs = toolCall.toolArgs as ToolReadContentArgs;
        const readContentIdentifier =
            readContentToolArgs.slug ?? readContentToolArgs.documentUuid;
        return readContentIdentifier && readContentToolArgs.type ? (
            <ContentEditorToolCallDescription
                action="read"
                slug={readContentIdentifier}
                type={readContentToolArgs.type}
            />
        ) : (
            <> </>
        );
    },
    editContent: ({ toolCall, approval }) => {
        const editContentToolArgs = toolCall.toolArgs as ToolEditContentArgs;
        if (
            editContentToolArgs.type === 'sql_chart' &&
            editContentToolArgs.slug
        ) {
            return (
                <SqlChartToolCallDescription
                    action="edit"
                    slug={editContentToolArgs.slug}
                    chart={{
                        sql:
                            getPatchedSql(editContentToolArgs.patch) ??
                            undefined,
                    }}
                    approval={approval ?? null}
                />
            );
        }
        return editContentToolArgs.slug && editContentToolArgs.type ? (
            <ContentEditorToolCallDescription
                action="edit"
                slug={editContentToolArgs.slug}
                type={editContentToolArgs.type}
            />
        ) : (
            <> </>
        );
    },
    createContent: ({ toolCall, approval }) => {
        const createContentToolArgs =
            toolCall.toolArgs as ToolCreateContentArgs;
        if (
            createContentToolArgs.type === 'sql_chart' &&
            createContentToolArgs.content?.slug
        ) {
            return (
                <SqlChartToolCallDescription
                    action="create"
                    slug={createContentToolArgs.content.slug}
                    chart={createContentToolArgs.content}
                    approval={approval ?? null}
                />
            );
        }
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
    },
    listWarehouseTables: ({ toolCall }) => {
        const listWarehouseTablesArgs =
            toolCall.toolArgs as ToolListWarehouseTablesArgs;
        return (
            <ListWarehouseTablesToolCallDescription
                schema={listWarehouseTablesArgs.schema ?? null}
                search={listWarehouseTablesArgs.search ?? null}
            />
        );
    },
    listContent: ({ toolCall }) => {
        const listContentArgs = toolCall.toolArgs as ToolListContentArgs;
        return (
            <ListContentToolCallDescription
                page={listContentArgs.page}
                spaceSlug={listContentArgs.spaceSlug}
            />
        );
    },
    runContentQuery: ({ toolCall, approval }) => {
        const runContentQueryArgs =
            toolCall.toolArgs as ToolRunContentQueryArgs;
        return (
            <RunContentQueryToolCallDescription
                source={runContentQueryArgs.source}
                approval={approval}
            />
        );
    },
    describeWarehouseTable: ({ toolCall }) => {
        const describeWarehouseTableArgs =
            toolCall.toolArgs as ToolDescribeWarehouseTableArgs;
        return (
            <DescribeWarehouseTableToolCallDescription
                table={describeWarehouseTableArgs.table}
                schema={describeWarehouseTableArgs.schema ?? null}
            />
        );
    },
    getKnowledgeDocumentContent: ({ toolCall }) => {
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
    },
    searchSemanticLayer: ({ toolCall }) => {
        const searchSemanticLayerArgs =
            toolCall.toolArgs as ToolSearchSemanticLayerArgs;
        return (
            <SemanticLayerSearchToolCallDescription
                page={searchSemanticLayerArgs.page}
                searchQuery={searchSemanticLayerArgs.searchQuery}
                type={searchSemanticLayerArgs.type}
            />
        );
    },
    analyzeFieldImpact: ({ toolCall }) => {
        const analyzeFieldImpactArgs =
            toolCall.toolArgs as ToolAnalyzeFieldImpactArgs;
        return (
            <FieldImpactToolCallDescription
                fieldId={analyzeFieldImpactArgs.fieldId}
            />
        );
    },
    listKnowledgeDocuments: repoShellToolCallDescription,
    listProjects: repoShellToolCallDescription,
    getProjectInfo: repoShellToolCallDescription,
    generateHashes: repoShellToolCallDescription,
    generateUuids: repoShellToolCallDescription,
    loadProjectContext: repoShellToolCallDescription,
    exploreRepo: repoShellToolCallDescription,
    loadSkill: ({ toolCall, toolResult }) => {
        const args = toolCall.toolArgs as Partial<ToolLoadSkillArgs>;
        const servedSkill =
            toolResult &&
            toolResult.toolName === 'loadSkill' &&
            'metadata' in toolResult
                ? (toolResult.metadata as ToolLoadSkillOutput['metadata']).skill
                : undefined;
        return (
            <LoadSkillToolCallDescription
                name={args.name ?? null}
                resourceName={args.resourceName ?? null}
                servedSkill={servedSkill ?? null}
            />
        );
    },
    createScheduledDelivery: ({ toolCall, toolResult }) => {
        const args = toolCall.toolArgs as { name?: string };
        const metadata =
            toolResult &&
            toolResult.toolName === 'createScheduledDelivery' &&
            'metadata' in toolResult
                ? (toolResult.metadata as ToolCreateScheduledDeliveryOutput['metadata'])
                : undefined;
        return (
            <ScheduledDeliveryToolCallDescription
                name={args.name ?? null}
                href={metadata?.status === 'success' ? metadata.href : null}
            />
        );
    },
    discoverRepos: emptyToolCallDescription,
    listWorkstreams: emptyToolCallDescription,
    closePullRequest: emptyToolCallDescription,
    getPullRequestDiff: emptyToolCallDescription,
    generateDataApp: emptyToolCallDescription,
    iterateDataApp: emptyToolCallDescription,
    listDataAppThemes: emptyToolCallDescription,
    listDataAppConnections: emptyToolCallDescription,
    editDbtProject: emptyToolCallDescription,
    editProjectContext: emptyToolCallDescription,
    editRepo: emptyToolCallDescription,
    updateUserName: emptyToolCallDescription,
    syncDbtProject: emptyToolCallDescription,
    setupPreviewDeploy: emptyToolCallDescription,
    runSavedChart: emptyToolCallDescription,
    readPinnedThread: emptyToolCallDescription,
    readAttachments: emptyToolCallDescription,
    submitResearchReport: emptyToolCallDescription,
    delegateResearchTask: emptyToolCallDescription,
    submitWorkerFindings: emptyToolCallDescription,
    loadMcpTools: emptyToolCallDescription,
    resolveUrl: emptyToolCallDescription,
    findCustomChartTypes: emptyToolCallDescription,
};

export const ToolCallDescription: FC<{
    toolName: ToolName;
    toolCall: ToolCallSummary;
    toolResult?: AiAgentToolResult;
    /**
     * Live per-node execution statuses for a running composer pipeline,
     * keyed by nodeId. Only meaningful for runComposerQueries; omitted for
     * persisted views, which render the pipeline without indicators.
     */
    composerNodeStatuses?: Record<string, ComposerQueryNodeStatus>;
    /** Approval target while this call's SQL awaits the user's decision. */
    approval?: SqlApprovalTarget;
}> = ({ toolName, toolCall, toolResult, composerNodeStatuses, approval }) => {
    // Mid-stream the toolArgs payload can arrive before any input chunks have
    // been parsed. Casting an undefined value and reading fields throws, so
    // bail until args exist.
    if (!toolCall.toolArgs || typeof toolCall.toolArgs !== 'object') {
        return <> </>;
    }
    return DESCRIPTION_BY_TOOL[toolName]({
        toolCall,
        toolResult,
        composerNodeStatuses,
        approval,
    });
};
