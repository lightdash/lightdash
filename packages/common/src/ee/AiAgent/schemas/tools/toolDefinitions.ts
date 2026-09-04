import { z } from 'zod';
import { aiDeepResearchReportInputSchema } from '../../../aiDeepResearch/markdown';
import { AI_DEEP_RESEARCH_MAX_WORKERS } from '../../../aiDeepResearch/types';
import {
    aiDeepResearchWorkerFindingsInputSchema,
    aiDeepResearchWorkerTaskInputSchema,
} from '../../../aiDeepResearch/workers';
import {
    MCP_TOOL_GET_AI_WRITEBACK_STATUS_DESCRIPTION,
    MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    mcpGetAiWritebackStatusArgsSchema,
    mcpGetAiWritebackStatusStructuredOutputSchema,
    mcpRunAiWritebackArgsSchema,
    mcpRunAiWritebackStructuredOutputSchema,
} from '../../../aiWriteback/types';
import { createAgentInputSchema } from '../agentInputSchema';
import {
    defineTool,
    modelGuidanceSourceByRuntime,
    type AgentToolView,
    type McpToolAnnotations,
    type ToolDefinitionInstance,
    type ToolDefinitionWithMcpOutput,
    type ToolDefinitionWithoutMcpOutput,
    type ToolDescriptionContext,
} from '../defineTool';
import {
    toolRunQueryExpressionArgsSchema,
    toolRunQueryExpressionArgsSchemaV2Mcp,
    toolRunQueryExpressionArgsSchemaV2RejectingMerge,
    type toolRunQueryExpressionArgsSchemaV2FormulaOnly,
} from '../filterExpressions';
import {
    MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    mcpToolListExploresArgsSchema,
} from './mcpToolListExploresArgs';
import {
    TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
    toolAnalyzeFieldImpactArgsSchema,
    toolAnalyzeFieldImpactOutputSchema,
} from './toolAnalyzeFieldImpactArgs';
import {
    TOOL_LIST_SKILLS_DESCRIPTION,
    TOOL_LOAD_SKILL_DESCRIPTION_MCP,
    TOOL_LOAD_SKILL_RESOURCE_DESCRIPTION,
    toolListSkillsArgsSchema,
    toolListSkillsOutputSchema,
    toolLoadSkillMcpArgsSchema,
    toolLoadSkillOutputSchemaMcp,
    toolLoadSkillResourceArgsSchema,
    toolLoadSkillResourceOutputSchema,
} from './toolBuiltInSkillArgs';
import {
    TOOL_CLOSE_PULL_REQUEST_DESCRIPTION,
    toolClosePullRequestArgsSchema,
    toolClosePullRequestOutputSchema,
} from './toolClosePullRequestArgs';
import {
    TOOL_COMPOSER_QUERIES_DESCRIPTION,
    toolComposerQueriesArgsSchema,
    toolComposerQueriesOutputSchema,
} from './toolComposerQueryArgs';
import {
    TOOL_CREATE_CONTENT_DESCRIPTION,
    toolCreateContentArgsSchema,
    toolCreateContentOutputSchema,
} from './toolCreateContentArgs';
import {
    TOOL_CREATE_SCHEDULED_DELIVERY_DESCRIPTION,
    toolCreateScheduledDeliveryArgsSchema,
    toolCreateScheduledDeliveryOutputSchema,
} from './toolCreateScheduledDeliveryArgs';
import {
    TOOL_DASHBOARD_V2_DESCRIPTION,
    toolDashboardV2ArgsSchema,
    toolDashboardV2OutputSchema,
} from './toolDashboardV2Args';
import {
    TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    toolDescribeWarehouseTableArgsSchema,
    toolDescribeWarehouseTableOutputSchema,
} from './toolDescribeWarehouseTableArgs';
import {
    DISCOVER_FIELDS_DESCRIPTION,
    discoverFieldsInputSchema,
    toolDiscoverFieldsOutputSchema,
} from './toolDiscoverFieldsArgs';
import {
    TOOL_DISCOVER_REPOS_DESCRIPTION,
    toolDiscoverReposArgsSchema,
    toolDiscoverReposOutputSchema,
} from './toolDiscoverReposArgs';
import {
    TOOL_EDIT_CONTENT_DESCRIPTION,
    toolEditContentArgsSchema,
    toolEditContentOutputSchema,
} from './toolEditContentArgs';
import {
    TOOL_EDIT_DBT_PROJECT_DESCRIPTION,
    toolEditDbtProjectArgsSchema,
    toolEditDbtProjectOutputSchema,
} from './toolEditDbtProjectArgs';
import {
    TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION,
    toolEditProjectContextArgsSchema,
    toolEditProjectContextOutputSchema,
} from './toolEditProjectContextArgs';
import {
    TOOL_EDIT_REPO_DESCRIPTION,
    toolEditRepoArgsSchema,
    toolEditRepoOutputSchema,
} from './toolEditRepoArgs';
import {
    TOOL_EXPLORE_REPO_DESCRIPTION,
    toolExploreRepoArgsSchema,
    toolExploreRepoOutputSchema,
} from './toolExploreRepoArgs';
import {
    TOOL_FIND_CHARTS_DESCRIPTION,
    toolFindChartsArgsSchema,
    toolFindChartsOutputSchema,
} from './toolFindChartsArgs';
import {
    TOOL_FIND_CONTENT_DESCRIPTION,
    toolFindContentArgsSchema,
    toolFindContentOutputSchema,
} from './toolFindContentArgs';
import {
    TOOL_FIND_CUSTOM_CHART_TYPES_DESCRIPTION,
    toolFindCustomChartTypesArgsSchema,
    toolFindCustomChartTypesOutputSchema,
} from './toolFindCustomChartTypesArgs';
import {
    TOOL_FIND_DASHBOARDS_DESCRIPTION,
    toolFindDashboardsArgsSchema,
    toolFindDashboardsOutputSchema,
} from './toolFindDashboardsArgs';
import {
    TOOL_FIND_EXPLORES_DESCRIPTION,
    toolFindExploresArgsSchemaV3,
    toolFindExploresOutputSchema,
} from './toolFindExploresArgs';
import {
    TOOL_FIND_FIELDS_DESCRIPTION,
    toolFindFieldsArgsSchema,
    toolFindFieldsOutputSchema,
} from './toolFindFieldsArgs';
import {
    TOOL_GENERATE_DATA_APP_DESCRIPTION,
    toolGenerateDataAppArgsSchema,
    toolGenerateDataAppOutputSchema,
} from './toolGenerateDataAppArgs';
import {
    mcpGenerateHashesStructuredOutputSchema,
    TOOL_GENERATE_HASHES_DESCRIPTION,
    toolGenerateHashesArgsSchema,
    toolGenerateHashesOutputSchema,
} from './toolGenerateHashesArgs';
import {
    TOOL_GENERATE_UUIDS_DESCRIPTION,
    toolGenerateUuidsArgsSchema,
    toolGenerateUuidsOutputSchema,
} from './toolGenerateUuidsArgs';
import {
    TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION,
    toolGetDashboardChartsArgsSchema,
    toolGetDashboardChartsOutputSchema,
} from './toolGetDashboardChartsArgs';
import {
    TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION,
    toolGetKnowledgeDocumentContentArgsSchema,
    toolGetKnowledgeDocumentContentOutputSchema,
} from './toolGetKnowledgeDocumentContentArgs';
import {
    GET_METADATA_DESCRIPTION,
    getMetadataInputSchema,
    getMetadataResultSchema,
    toolGetMetadataOutputSchema,
} from './toolGetMetadataArgs';
import {
    TOOL_GET_PROJECT_INFO_DESCRIPTION,
    toolGetProjectInfoArgsSchema,
    toolGetProjectInfoOutputSchema,
} from './toolGetProjectInfoArgs';
import {
    TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION,
    toolGetPullRequestDiffArgsSchema,
    toolGetPullRequestDiffOutputSchema,
} from './toolGetPullRequestDiffArgs';
import {
    TOOL_GET_QUERY_RESULT_DESCRIPTION,
    toolGetQueryResultArgsSchema,
} from './toolGetQueryResultArgs';
import {
    GREP_FIELDS_DESCRIPTION,
    grepFieldsInputSchema,
    grepFieldsResultSchema,
    toolGrepFieldsOutputSchema,
} from './toolGrepFieldsArgs';
import {
    TOOL_ITERATE_DATA_APP_DESCRIPTION,
    toolIterateDataAppArgsSchema,
    toolIterateDataAppOutputSchema,
} from './toolIterateDataAppArgs';
import {
    TOOL_LIST_CONTENT_DESCRIPTION,
    toolListContentArgsSchema,
    toolListContentOutputSchema,
} from './toolListContentArgs';
import {
    TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    toolListKnowledgeDocumentsArgsSchema,
    toolListKnowledgeDocumentsOutputSchema,
} from './toolListKnowledgeDocumentsArgs';
import {
    TOOL_LIST_PROJECTS_DESCRIPTION,
    toolListProjectsArgsSchema,
    toolListProjectsOutputSchema,
} from './toolListProjectsArgs';
import {
    TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    toolListWarehouseTablesArgsSchema,
    toolListWarehouseTablesOutputSchema,
} from './toolListWarehouseTablesArgs';
import {
    TOOL_LIST_WORKSTREAMS_DESCRIPTION,
    toolListWorkstreamsArgsSchema,
    toolListWorkstreamsOutputSchema,
} from './toolListWorkstreamsArgs';
import {
    TOOL_LOAD_MCP_TOOLS_DESCRIPTION,
    toolLoadMcpToolsArgsSchema,
    toolLoadMcpToolsOutputSchema,
} from './toolLoadMcpToolsArgs';
import {
    TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION,
    toolLoadProjectContextArgsSchema,
    toolLoadProjectContextOutputSchema,
} from './toolLoadProjectContextArgs';
import {
    TOOL_LOAD_SKILL_DESCRIPTION,
    toolLoadSkillArgsSchema,
    toolLoadSkillOutputSchema,
} from './toolLoadSkillArgs';
import {
    mcpGetQueryResultStructuredOutputSchema,
    mcpRenderChartStructuredOutputSchema,
    mcpRunMetricQueryStructuredOutputSchema,
    mcpRunSqlStructuredOutputSchema,
} from './toolQueryResultSchemas';
import {
    TOOL_READ_CONTENT_DESCRIPTION,
    toolReadContentArgsSchema,
    toolReadContentOutputSchema,
} from './toolReadContentArgs';
import {
    TOOL_READ_PINNED_THREAD_DESCRIPTION,
    toolReadPinnedThreadArgsSchema,
    toolReadPinnedThreadOutputSchema,
} from './toolReadPinnedThreadArgs';
import {
    TOOL_RESOLVE_URL_DESCRIPTION,
    toolResolveUrlArgsSchema,
    toolResolveUrlOutputSchema,
} from './toolResolveUrlArgs';
import {
    TOOL_RUN_CONTENT_QUERY_DESCRIPTION,
    toolRunContentQueryArgsSchema,
    toolRunContentQueryOutputSchema,
} from './toolRunContentQueryArgs';
import {
    TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    toolRunMetricQueryArgsSchema,
    toolRunMetricQueryOutputSchema,
} from './toolRunMetricQueryArgs';
import {
    TOOL_RENDER_CHART_DESCRIPTION,
    TOOL_RUN_QUERY_DESCRIPTION,
    toolRenderChartArgsSchema,
    toolRenderChartArgsSchemaTransformed,
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryArgsSchemaV2Mcp,
    toolRunQueryArgsSchemaV2RejectingMerge,
    toolRunQueryArgsSchemaV2Transformed,
    toolRunQueryOutputSchema,
    type toolRunQueryArgsSchemaV2FormulaOnly,
} from './toolRunQueryArgs';
import {
    TOOL_RUN_SAVED_CHART_DESCRIPTION,
    toolRunSavedChartArgsSchema,
    toolRunSavedChartOutputSchema,
} from './toolRunSavedChartArgs';
import {
    buildRunSqlDescription,
    DEFAULT_RUN_SQL_LIMIT,
    DEFAULT_RUN_SQL_MAX_LIMIT,
    toolRunSqlArgsSchema,
    toolRunSqlOutputSchema,
} from './toolRunSqlArgs';
import {
    TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION,
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesExpressionArgsSchema,
    toolSearchFieldValuesOutputSchema,
} from './toolSearchFieldValuesArgs';
import {
    TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION,
    toolSearchSemanticLayerArgsSchema,
    toolSearchSemanticLayerOutputSchema,
} from './toolSearchSemanticLayerArgs';
import {
    TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION,
    toolSetupPreviewDeployArgsSchema,
    toolSetupPreviewDeployOutputSchema,
} from './toolSetupPreviewDeployArgs';
import {
    TOOL_SYNC_DBT_PROJECT_DESCRIPTION,
    toolSyncDbtProjectArgsSchema,
    toolSyncDbtProjectOutputSchema,
} from './toolSyncDbtProjectArgs';
import {
    TOOL_UPDATE_USER_NAME_DESCRIPTION,
    toolUpdateUserNameArgsSchema,
    toolUpdateUserNameOutputSchema,
} from './toolUpdateUserNameArgs';

const readOnlyAnnotations: McpToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

const writeAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};

const destructiveWriteAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
};

const contextWriteAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

const externalWriteAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};

const destructiveExternalWriteAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
};

const emptyInputSchema = z.object({});

const mcpGetContextOutputSchema = z.object({
    activeProject: z
        .object({
            projectUuid: z.string(),
            projectName: z.string(),
            selectedTags: z.array(z.string()).nullable(),
        })
        .nullable(),
    activeAgent: z
        .object({
            agentUuid: z.string(),
            agentName: z.string(),
            projectUuid: z.string(),
        })
        .nullable(),
    availableProjects: z.array(
        z.object({
            projectUuid: z.string(),
            name: z.string(),
            type: z.string(),
            expiresAt: z.string().nullable(),
            availableAgents: z.array(
                z.object({
                    agentUuid: z.string(),
                    name: z.string(),
                    description: z.string().nullable(),
                    tags: z.array(z.string()).nullable(),
                }),
            ),
        }),
    ),
});

const routeAgentArgsSchema = z.object({
    prompt: z.string(),
    projectUuid: z.string().optional(),
});

const routeAgentStructuredOutputSchema = z.object({
    agentUuid: z.string(),
    agentName: z.string(),
    agentDescription: z.string().nullable(),
    agentTags: z.array(z.string()).nullable(),
    agentSpaceAccess: z.array(z.string()),
    agentProjectUuid: z.string(),
    explores: z.array(z.string()),
    verifiedQuestions: z.array(z.string()),
    instruction: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string(),
    candidates: z.array(
        z.object({
            agentUuid: z.string(),
            name: z.string(),
            description: z.string().nullable(),
        }),
    ),
});

export const findExploresToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findExplores',
    typeof toolFindExploresArgsSchemaV3,
    typeof toolFindExploresArgsSchemaV3,
    typeof toolFindExploresOutputSchema
> = defineTool({
    name: 'findExplores',
    title: 'Find explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindExploresArgsSchemaV3,
    agent: { outputSchema: toolFindExploresOutputSchema },
});

export const findCustomChartTypesToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findCustomChartTypes',
    typeof toolFindCustomChartTypesArgsSchema,
    typeof toolFindCustomChartTypesArgsSchema,
    typeof toolFindCustomChartTypesOutputSchema
> = defineTool({
    name: 'findCustomChartTypes',
    title: 'Find custom chart types',
    description: TOOL_FIND_CUSTOM_CHART_TYPES_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindCustomChartTypesArgsSchema,
    agent: { outputSchema: toolFindCustomChartTypesOutputSchema },
});

export const findFieldsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findFields',
    typeof toolFindFieldsArgsSchema,
    typeof toolFindFieldsArgsSchema,
    typeof toolFindFieldsOutputSchema
> = defineTool({
    name: 'findFields',
    title: 'Find fields',
    description: TOOL_FIND_FIELDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindFieldsArgsSchema,
    agent: { outputSchema: toolFindFieldsOutputSchema },
});

export const searchSemanticLayerToolDefinition: ToolDefinitionWithoutMcpOutput<
    'searchSemanticLayer',
    typeof toolSearchSemanticLayerArgsSchema,
    typeof toolSearchSemanticLayerArgsSchema,
    typeof toolSearchSemanticLayerOutputSchema
> = defineTool({
    name: 'searchSemanticLayer',
    title: 'Search semantic layer',
    description: TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION,
    // Agent-only for now: exposed on the agent ToolSet but not on the MCP
    // surface.
    availability: ['agent'],
    inputSchema: toolSearchSemanticLayerArgsSchema,
    agent: { outputSchema: toolSearchSemanticLayerOutputSchema },
});

export const analyzeFieldImpactToolDefinition: ToolDefinitionWithoutMcpOutput<
    'analyzeFieldImpact',
    typeof toolAnalyzeFieldImpactArgsSchema,
    typeof toolAnalyzeFieldImpactArgsSchema,
    typeof toolAnalyzeFieldImpactOutputSchema
> = defineTool({
    name: 'analyzeFieldImpact',
    title: 'Analyze field impact',
    description: TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolAnalyzeFieldImpactArgsSchema,
    agent: { outputSchema: toolAnalyzeFieldImpactOutputSchema },
});

export const findContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findContent',
    typeof toolFindContentArgsSchema,
    typeof toolFindContentArgsSchema,
    typeof toolFindContentOutputSchema
> = defineTool({
    name: 'findContent',
    title: 'Find content',
    description: TOOL_FIND_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolFindContentArgsSchema,
    agent: { outputSchema: toolFindContentOutputSchema },
    mcp: { annotations: readOnlyAnnotations },
});

export const searchFieldValuesToolDefinition: ToolDefinitionWithoutMcpOutput<
    'searchFieldValues',
    typeof toolSearchFieldValuesArgsSchema,
    typeof toolSearchFieldValuesArgsSchema,
    typeof toolSearchFieldValuesOutputSchema
> = defineTool({
    name: 'searchFieldValues',
    title: 'Search field values',
    description: TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolSearchFieldValuesArgsSchema,
    agent: { outputSchema: toolSearchFieldValuesOutputSchema },
    mcp: { annotations: readOnlyAnnotations },
});

export const searchFieldValuesFilterExpressionToolDefinition: ToolDefinitionWithoutMcpOutput<
    'searchFieldValues',
    typeof toolSearchFieldValuesExpressionArgsSchema,
    typeof toolSearchFieldValuesExpressionArgsSchema,
    typeof toolSearchFieldValuesOutputSchema
> = defineTool({
    name: 'searchFieldValues',
    title: 'Search field values',
    description: TOOL_SEARCH_FIELD_VALUES_FILTER_EXPRESSION_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolSearchFieldValuesExpressionArgsSchema,
    agent: { outputSchema: toolSearchFieldValuesOutputSchema },
    mcp: { annotations: readOnlyAnnotations },
});

export const generateVisualizationToolDefinition: ToolDefinitionWithoutMcpOutput<
    'generateVisualization',
    typeof toolRunQueryArgsSchema,
    typeof toolRunQueryArgsSchemaTransformed,
    typeof toolRunQueryOutputSchema
> = defineTool({
    name: 'generateVisualization',
    title: 'Generate visualization',
    description: TOOL_RUN_QUERY_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunQueryArgsSchema,
    inputSchemaTransformed: toolRunQueryArgsSchemaTransformed,
    agent: { outputSchema: toolRunQueryOutputSchema },
});

const TOOL_RUN_QUERY_FILTER_EXPRESSION_DESCRIPTION = (
    context: ToolDescriptionContext,
): string =>
    `${TOOL_RUN_QUERY_DESCRIPTION(
        context,
    )}\nFilter expressions use \`<fieldId> <operator>[=<value>...]\`. The input schema defines category placement and nullability; for supported operators, quoting, arity, connectors, and examples, follow ${modelGuidanceSourceByRuntime[context.runtime]}.`;

export const generateVisualizationFilterExpressionToolDefinition: ToolDefinitionWithoutMcpOutput<
    'generateVisualization',
    typeof toolRunQueryExpressionArgsSchema,
    typeof toolRunQueryExpressionArgsSchema,
    typeof toolRunQueryOutputSchema
> = defineTool({
    name: 'generateVisualization',
    title: 'Generate visualization',
    description: TOOL_RUN_QUERY_FILTER_EXPRESSION_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunQueryExpressionArgsSchema,
    inputSchemaTransformed: toolRunQueryExpressionArgsSchema,
    agent: { outputSchema: toolRunQueryOutputSchema },
});

export const runQueryToolDefinition: ToolDefinitionWithMcpOutput<
    'runQuery',
    typeof toolRunQueryArgsSchemaV2Mcp,
    typeof toolRunQueryArgsSchemaV2Transformed,
    typeof toolRunQueryOutputSchema,
    typeof mcpRunMetricQueryStructuredOutputSchema
> = defineTool({
    name: 'runQuery',
    title: 'Run metric query',
    description: TOOL_RUN_QUERY_DESCRIPTION,
    availability: ['agent', 'mcp'],
    // MCP contract: formula-only table calcs (template calls fail at the
    // boundary with an error the model can correct) and builtin-only chart
    // config (custom chart types are agent-only for the PoC). The
    // transformed parse stays wide for persisted-args replay.
    inputSchema: toolRunQueryArgsSchemaV2Mcp,
    inputSchemaTransformed: toolRunQueryArgsSchemaV2Transformed,
    agent: { outputSchema: toolRunQueryOutputSchema },
    mcp: {
        name: 'run_metric_query',
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpRunMetricQueryStructuredOutputSchema,
    },
});

export const runQueryFilterExpressionToolDefinition: ToolDefinitionWithMcpOutput<
    'runQuery',
    typeof toolRunQueryExpressionArgsSchemaV2Mcp,
    typeof toolRunQueryExpressionArgsSchemaV2Mcp,
    typeof toolRunQueryOutputSchema,
    typeof mcpRunMetricQueryStructuredOutputSchema
> = defineTool({
    name: 'runQuery',
    title: 'Run metric query',
    description: TOOL_RUN_QUERY_FILTER_EXPRESSION_DESCRIPTION,
    availability: ['agent', 'mcp'],
    // Match the legacy MCP boundary: formula-only table calculations and
    // builtin chart configs. Persisted expression V2 parsing remains wide.
    inputSchema: toolRunQueryExpressionArgsSchemaV2Mcp,
    inputSchemaTransformed: toolRunQueryExpressionArgsSchemaV2Mcp,
    agent: { outputSchema: toolRunQueryOutputSchema },
    mcp: {
        name: 'run_metric_query',
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpRunMetricQueryStructuredOutputSchema,
    },
});

// The agent view of runQuery for runtimes without merge queries: identical
// contract, but a merge-shaped payload fails validation instead of being
// stripped to the primary query by Zod. Lazy, like `.for('agent')`.
export const getRunQueryAgentViewRejectingMerge = (): AgentToolView<
    'runQuery',
    typeof toolRunQueryArgsSchemaV2FormulaOnly,
    typeof toolRunQueryOutputSchema
> => ({
    ...runQueryToolDefinition.for('agent'),
    inputSchema: createAgentInputSchema(toolRunQueryArgsSchemaV2RejectingMerge),
});

export const getRunQueryFilterExpressionAgentViewRejectingMerge =
    (): AgentToolView<
        'runQuery',
        typeof toolRunQueryExpressionArgsSchemaV2FormulaOnly,
        typeof toolRunQueryOutputSchema
    > => ({
        ...runQueryFilterExpressionToolDefinition.for('agent'),
        inputSchema: createAgentInputSchema(
            toolRunQueryExpressionArgsSchemaV2RejectingMerge,
        ),
    });

export const runSqlToolDefinition: ToolDefinitionWithMcpOutput<
    'runSql',
    typeof toolRunSqlArgsSchema,
    typeof toolRunSqlArgsSchema,
    typeof toolRunSqlOutputSchema,
    typeof mcpRunSqlStructuredOutputSchema
> = defineTool({
    name: 'runSql',
    title: 'Run SQL',
    description: buildRunSqlDescription(
        DEFAULT_RUN_SQL_LIMIT,
        DEFAULT_RUN_SQL_MAX_LIMIT,
    ),
    availability: ['agent', 'mcp'],
    inputSchema: toolRunSqlArgsSchema,
    agent: { outputSchema: toolRunSqlOutputSchema },
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpRunSqlStructuredOutputSchema,
    },
});

export const runComposerQueriesToolDefinition: ToolDefinitionWithoutMcpOutput<
    'runComposerQueries',
    typeof toolComposerQueriesArgsSchema,
    typeof toolComposerQueriesArgsSchema,
    typeof toolComposerQueriesOutputSchema
> = defineTool({
    name: 'runComposerQueries',
    title: 'Run composer queries',
    description: TOOL_COMPOSER_QUERIES_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolComposerQueriesArgsSchema,
    agent: { outputSchema: toolComposerQueriesOutputSchema },
    mcp: {
        name: 'run_composer_queries',
        annotations: readOnlyAnnotations,
    },
});

export const getQueryResultToolDefinition: ToolDefinitionWithMcpOutput<
    'getQueryResult',
    typeof toolGetQueryResultArgsSchema,
    typeof toolGetQueryResultArgsSchema,
    undefined,
    typeof mcpGetQueryResultStructuredOutputSchema
> = defineTool({
    name: 'getQueryResult',
    title: 'Get query result',
    description: TOOL_GET_QUERY_RESULT_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: toolGetQueryResultArgsSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpGetQueryResultStructuredOutputSchema,
    },
});

export const renderChartToolDefinition: ToolDefinitionWithMcpOutput<
    'renderChart',
    typeof toolRenderChartArgsSchema,
    typeof toolRenderChartArgsSchemaTransformed,
    undefined,
    typeof mcpRenderChartStructuredOutputSchema
> = defineTool({
    name: 'renderChart',
    title: 'Render chart',
    description: TOOL_RENDER_CHART_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: toolRenderChartArgsSchema,
    inputSchemaTransformed: toolRenderChartArgsSchemaTransformed,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpRenderChartStructuredOutputSchema,
    },
});

/** @deprecated Legacy CSV-only metric query tool. */
export const runMetricQueryToolDefinition: ToolDefinitionWithoutMcpOutput<
    'runMetricQuery',
    typeof toolRunMetricQueryArgsSchema,
    typeof toolRunMetricQueryArgsSchema,
    typeof toolRunMetricQueryOutputSchema
> = defineTool({
    name: 'runMetricQuery',
    title: 'Run metric query',
    description: TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunMetricQueryArgsSchema,
    agent: { outputSchema: toolRunMetricQueryOutputSchema },
});

/**
 * @deprecated Historical contract for persisted calls. New agent runs use
 * grepFields and getMetadata.
 */
export const discoverFieldsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'discoverFields',
    typeof discoverFieldsInputSchema,
    typeof discoverFieldsInputSchema,
    typeof toolDiscoverFieldsOutputSchema
> = defineTool({
    name: 'discoverFields',
    title: 'Discover fields',
    description: DISCOVER_FIELDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: discoverFieldsInputSchema,
    agent: { outputSchema: toolDiscoverFieldsOutputSchema },
});

export const grepFieldsToolDefinition: ToolDefinitionWithMcpOutput<
    'grepFields',
    typeof grepFieldsInputSchema,
    typeof grepFieldsInputSchema,
    typeof toolGrepFieldsOutputSchema,
    typeof grepFieldsResultSchema
> = defineTool({
    name: 'grepFields',
    title: 'Search fields',
    description: GREP_FIELDS_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: grepFieldsInputSchema,
    agent: { outputSchema: toolGrepFieldsOutputSchema },
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: grepFieldsResultSchema,
    },
});

export const getMetadataToolDefinition: ToolDefinitionWithMcpOutput<
    'getMetadata',
    typeof getMetadataInputSchema,
    typeof getMetadataInputSchema,
    typeof toolGetMetadataOutputSchema,
    typeof getMetadataResultSchema
> = defineTool({
    name: 'getMetadata',
    title: 'Get metadata',
    description: GET_METADATA_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: getMetadataInputSchema,
    agent: { outputSchema: toolGetMetadataOutputSchema },
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: getMetadataResultSchema,
    },
});

export const generateDashboardToolDefinition: ToolDefinitionWithoutMcpOutput<
    'generateDashboard',
    typeof toolDashboardV2ArgsSchema,
    typeof toolDashboardV2ArgsSchema,
    typeof toolDashboardV2OutputSchema
> = defineTool({
    name: 'generateDashboard',
    title: 'Generate dashboard',
    description: TOOL_DASHBOARD_V2_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDashboardV2ArgsSchema,
    agent: { outputSchema: toolDashboardV2OutputSchema },
});

export const generateUuidsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'generateUuids',
    typeof toolGenerateUuidsArgsSchema,
    typeof toolGenerateUuidsArgsSchema,
    typeof toolGenerateUuidsOutputSchema
> = defineTool({
    name: 'generateUuids',
    title: 'Generate UUIDs',
    description: TOOL_GENERATE_UUIDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGenerateUuidsArgsSchema,
    agent: { outputSchema: toolGenerateUuidsOutputSchema },
});

export const generateHashesToolDefinition: ToolDefinitionWithMcpOutput<
    'generateHashes',
    typeof toolGenerateHashesArgsSchema,
    typeof toolGenerateHashesArgsSchema,
    typeof toolGenerateHashesOutputSchema,
    typeof mcpGenerateHashesStructuredOutputSchema
> = defineTool({
    name: 'generateHashes',
    title: 'Generate hashes',
    description: TOOL_GENERATE_HASHES_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolGenerateHashesArgsSchema,
    agent: { outputSchema: toolGenerateHashesOutputSchema },
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpGenerateHashesStructuredOutputSchema,
    },
});

export const getDashboardChartsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getDashboardCharts',
    typeof toolGetDashboardChartsArgsSchema,
    typeof toolGetDashboardChartsArgsSchema,
    typeof toolGetDashboardChartsOutputSchema
> = defineTool({
    name: 'getDashboardCharts',
    title: 'Get dashboard charts',
    description: TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetDashboardChartsArgsSchema,
    agent: { outputSchema: toolGetDashboardChartsOutputSchema },
});

export const readContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'readContent',
    typeof toolReadContentArgsSchema,
    typeof toolReadContentArgsSchema,
    typeof toolReadContentOutputSchema
> = defineTool({
    name: 'readContent',
    title: 'Read content',
    description: TOOL_READ_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolReadContentArgsSchema,
    agent: { outputSchema: toolReadContentOutputSchema },
    mcp: {
        name: 'read_content',
        annotations: readOnlyAnnotations,
    },
});

export const resolveUrlToolDefinition: ToolDefinitionWithoutMcpOutput<
    'resolveUrl',
    typeof toolResolveUrlArgsSchema,
    typeof toolResolveUrlArgsSchema,
    typeof toolResolveUrlOutputSchema
> = defineTool({
    name: 'resolveUrl',
    title: 'Resolve URL',
    description: TOOL_RESOLVE_URL_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolResolveUrlArgsSchema,
    agent: { outputSchema: toolResolveUrlOutputSchema },
    mcp: {
        name: 'resolve_url',
        annotations: readOnlyAnnotations,
    },
});

export const editContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'editContent',
    typeof toolEditContentArgsSchema,
    typeof toolEditContentArgsSchema,
    typeof toolEditContentOutputSchema
> = defineTool({
    name: 'editContent',
    title: 'Edit content',
    description: TOOL_EDIT_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolEditContentArgsSchema,
    agent: { outputSchema: toolEditContentOutputSchema },
    mcp: {
        name: 'edit_content',
        annotations: destructiveWriteAnnotations,
    },
});

export const createContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'createContent',
    typeof toolCreateContentArgsSchema,
    typeof toolCreateContentArgsSchema,
    typeof toolCreateContentOutputSchema
> = defineTool({
    name: 'createContent',
    title: 'Create content',
    description: TOOL_CREATE_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolCreateContentArgsSchema,
    agent: { outputSchema: toolCreateContentOutputSchema },
    mcp: {
        name: 'create_content',
        annotations: writeAnnotations,
    },
});

export const createScheduledDeliveryToolDefinition: ToolDefinitionWithoutMcpOutput<
    'createScheduledDelivery',
    typeof toolCreateScheduledDeliveryArgsSchema,
    typeof toolCreateScheduledDeliveryArgsSchema,
    typeof toolCreateScheduledDeliveryOutputSchema
> = defineTool({
    name: 'createScheduledDelivery',
    title: 'Create scheduled delivery',
    description: TOOL_CREATE_SCHEDULED_DELIVERY_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolCreateScheduledDeliveryArgsSchema,
    agent: { outputSchema: toolCreateScheduledDeliveryOutputSchema },
    mcp: {
        name: 'create_scheduled_delivery',
        annotations: externalWriteAnnotations,
    },
});

export const updateUserNameToolDefinition: ToolDefinitionWithoutMcpOutput<
    'updateUserName',
    typeof toolUpdateUserNameArgsSchema,
    typeof toolUpdateUserNameArgsSchema,
    typeof toolUpdateUserNameOutputSchema
> = defineTool({
    name: 'updateUserName',
    title: 'Update user name',
    description: TOOL_UPDATE_USER_NAME_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolUpdateUserNameArgsSchema,
    agent: { outputSchema: toolUpdateUserNameOutputSchema },
});

export const runContentQueryToolDefinition: ToolDefinitionWithoutMcpOutput<
    'runContentQuery',
    typeof toolRunContentQueryArgsSchema,
    typeof toolRunContentQueryArgsSchema,
    typeof toolRunContentQueryOutputSchema
> = defineTool({
    name: 'runContentQuery',
    title: 'Run content query',
    description: TOOL_RUN_CONTENT_QUERY_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunContentQueryArgsSchema,
    agent: { outputSchema: toolRunContentQueryOutputSchema },
});

export const listContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listContent',
    typeof toolListContentArgsSchema,
    typeof toolListContentArgsSchema,
    typeof toolListContentOutputSchema
> = defineTool({
    name: 'listContent',
    title: 'List content',
    description: TOOL_LIST_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolListContentArgsSchema,
    agent: { outputSchema: toolListContentOutputSchema },
    mcp: {
        name: 'list_content',
        annotations: readOnlyAnnotations,
    },
});

export const listProjectsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listProjects',
    typeof toolListProjectsArgsSchema,
    typeof toolListProjectsArgsSchema,
    typeof toolListProjectsOutputSchema
> = defineTool({
    name: 'listProjects',
    title: 'List projects',
    description: TOOL_LIST_PROJECTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListProjectsArgsSchema,
    agent: { outputSchema: toolListProjectsOutputSchema },
});

export const getProjectInfoToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getProjectInfo',
    typeof toolGetProjectInfoArgsSchema,
    typeof toolGetProjectInfoArgsSchema,
    typeof toolGetProjectInfoOutputSchema
> = defineTool({
    name: 'getProjectInfo',
    title: 'Get project info',
    description: TOOL_GET_PROJECT_INFO_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetProjectInfoArgsSchema,
    agent: { outputSchema: toolGetProjectInfoOutputSchema },
});

export const loadSkillToolDefinition: ToolDefinitionWithoutMcpOutput<
    'loadSkill',
    typeof toolLoadSkillArgsSchema,
    typeof toolLoadSkillArgsSchema,
    typeof toolLoadSkillOutputSchema
> = defineTool({
    name: 'loadSkill',
    title: 'Load skill',
    description: TOOL_LOAD_SKILL_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolLoadSkillArgsSchema,
    agent: { outputSchema: toolLoadSkillOutputSchema },
});

export const loadProjectContextToolDefinition: ToolDefinitionWithoutMcpOutput<
    'loadProjectContext',
    typeof toolLoadProjectContextArgsSchema,
    typeof toolLoadProjectContextArgsSchema,
    typeof toolLoadProjectContextOutputSchema
> = defineTool({
    name: 'loadProjectContext',
    title: 'Load project context',
    description: TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolLoadProjectContextArgsSchema,
    agent: { outputSchema: toolLoadProjectContextOutputSchema },
});

export const loadMcpToolsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'loadMcpTools',
    typeof toolLoadMcpToolsArgsSchema,
    typeof toolLoadMcpToolsArgsSchema,
    typeof toolLoadMcpToolsOutputSchema
> = defineTool({
    name: 'loadMcpTools',
    title: 'Load MCP tools',
    description: TOOL_LOAD_MCP_TOOLS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolLoadMcpToolsArgsSchema,
    agent: { outputSchema: toolLoadMcpToolsOutputSchema },
});

export const generateDataAppToolDefinition: ToolDefinitionWithoutMcpOutput<
    'generateDataApp',
    typeof toolGenerateDataAppArgsSchema,
    typeof toolGenerateDataAppArgsSchema,
    typeof toolGenerateDataAppOutputSchema
> = defineTool({
    name: 'generateDataApp',
    title: 'Generate data app',
    description: TOOL_GENERATE_DATA_APP_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGenerateDataAppArgsSchema,
    agent: { outputSchema: toolGenerateDataAppOutputSchema },
});

export const iterateDataAppToolDefinition: ToolDefinitionWithoutMcpOutput<
    'iterateDataApp',
    typeof toolIterateDataAppArgsSchema,
    typeof toolIterateDataAppArgsSchema,
    typeof toolIterateDataAppOutputSchema
> = defineTool({
    name: 'iterateDataApp',
    title: 'Iterate on data app',
    description: TOOL_ITERATE_DATA_APP_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolIterateDataAppArgsSchema,
    agent: { outputSchema: toolIterateDataAppOutputSchema },
});

export const editDbtProjectToolDefinition: ToolDefinitionWithoutMcpOutput<
    'editDbtProject',
    typeof toolEditDbtProjectArgsSchema,
    typeof toolEditDbtProjectArgsSchema,
    typeof toolEditDbtProjectOutputSchema
> = defineTool({
    name: 'editDbtProject',
    title: 'Edit dbt project',
    description: TOOL_EDIT_DBT_PROJECT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolEditDbtProjectArgsSchema,
    agent: { outputSchema: toolEditDbtProjectOutputSchema },
});

export const editProjectContextToolDefinition: ToolDefinitionWithoutMcpOutput<
    'editProjectContext',
    typeof toolEditProjectContextArgsSchema,
    typeof toolEditProjectContextArgsSchema,
    typeof toolEditProjectContextOutputSchema
> = defineTool({
    name: 'editProjectContext',
    title: 'Edit project context',
    description: TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolEditProjectContextArgsSchema,
    agent: { outputSchema: toolEditProjectContextOutputSchema },
});

export const editRepoToolDefinition: ToolDefinitionWithoutMcpOutput<
    'editRepo',
    typeof toolEditRepoArgsSchema,
    typeof toolEditRepoArgsSchema,
    typeof toolEditRepoOutputSchema
> = defineTool({
    name: 'editRepo',
    title: 'Edit repository',
    description: TOOL_EDIT_REPO_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolEditRepoArgsSchema,
    agent: { outputSchema: toolEditRepoOutputSchema },
});

export const syncDbtProjectToolDefinition: ToolDefinitionWithoutMcpOutput<
    'syncDbtProject',
    typeof toolSyncDbtProjectArgsSchema,
    typeof toolSyncDbtProjectArgsSchema,
    typeof toolSyncDbtProjectOutputSchema
> = defineTool({
    name: 'syncDbtProject',
    title: 'Sync dbt project',
    description: TOOL_SYNC_DBT_PROJECT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolSyncDbtProjectArgsSchema,
    agent: { outputSchema: toolSyncDbtProjectOutputSchema },
});

export const exploreRepoToolDefinition: ToolDefinitionWithoutMcpOutput<
    'exploreRepo',
    typeof toolExploreRepoArgsSchema,
    typeof toolExploreRepoArgsSchema,
    typeof toolExploreRepoOutputSchema
> = defineTool({
    name: 'exploreRepo',
    title: 'Explore repository',
    description: TOOL_EXPLORE_REPO_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolExploreRepoArgsSchema,
    agent: { outputSchema: toolExploreRepoOutputSchema },
});

export const discoverReposToolDefinition: ToolDefinitionWithoutMcpOutput<
    'discoverRepos',
    typeof toolDiscoverReposArgsSchema,
    typeof toolDiscoverReposArgsSchema,
    typeof toolDiscoverReposOutputSchema
> = defineTool({
    name: 'discoverRepos',
    title: 'Discover repositories',
    description: TOOL_DISCOVER_REPOS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDiscoverReposArgsSchema,
    agent: { outputSchema: toolDiscoverReposOutputSchema },
});

export const listWorkstreamsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listWorkstreams',
    typeof toolListWorkstreamsArgsSchema,
    typeof toolListWorkstreamsArgsSchema,
    typeof toolListWorkstreamsOutputSchema
> = defineTool({
    name: 'listWorkstreams',
    title: 'List pull requests',
    description: TOOL_LIST_WORKSTREAMS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListWorkstreamsArgsSchema,
    agent: { outputSchema: toolListWorkstreamsOutputSchema },
});

export const closePullRequestToolDefinition: ToolDefinitionWithoutMcpOutput<
    'closePullRequest',
    typeof toolClosePullRequestArgsSchema,
    typeof toolClosePullRequestArgsSchema,
    typeof toolClosePullRequestOutputSchema
> = defineTool({
    name: 'closePullRequest',
    title: 'Close pull request',
    description: TOOL_CLOSE_PULL_REQUEST_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolClosePullRequestArgsSchema,
    agent: { outputSchema: toolClosePullRequestOutputSchema },
});

export const getPullRequestDiffToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getPullRequestDiff',
    typeof toolGetPullRequestDiffArgsSchema,
    typeof toolGetPullRequestDiffArgsSchema,
    typeof toolGetPullRequestDiffOutputSchema
> = defineTool({
    name: 'getPullRequestDiff',
    title: 'Read pull request diff',
    description: TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetPullRequestDiffArgsSchema,
    agent: { outputSchema: toolGetPullRequestDiffOutputSchema },
});

export const setupPreviewDeployToolDefinition: ToolDefinitionWithoutMcpOutput<
    'setupPreviewDeploy',
    typeof toolSetupPreviewDeployArgsSchema,
    typeof toolSetupPreviewDeployArgsSchema,
    typeof toolSetupPreviewDeployOutputSchema
> = defineTool({
    name: 'setupPreviewDeploy',
    title: 'Set up preview deploys',
    description: TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolSetupPreviewDeployArgsSchema,
    agent: { outputSchema: toolSetupPreviewDeployOutputSchema },
});

export const runSavedChartToolDefinition: ToolDefinitionWithoutMcpOutput<
    'runSavedChart',
    typeof toolRunSavedChartArgsSchema,
    typeof toolRunSavedChartArgsSchema,
    typeof toolRunSavedChartOutputSchema
> = defineTool({
    name: 'runSavedChart',
    title: 'Run saved chart',
    description: TOOL_RUN_SAVED_CHART_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunSavedChartArgsSchema,
    agent: { outputSchema: toolRunSavedChartOutputSchema },
});

export const listWarehouseTablesToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listWarehouseTables',
    typeof toolListWarehouseTablesArgsSchema,
    typeof toolListWarehouseTablesArgsSchema,
    typeof toolListWarehouseTablesOutputSchema
> = defineTool({
    name: 'listWarehouseTables',
    title: 'List warehouse tables',
    description: TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListWarehouseTablesArgsSchema,
    agent: { outputSchema: toolListWarehouseTablesOutputSchema },
});

export const describeWarehouseTableToolDefinition: ToolDefinitionWithoutMcpOutput<
    'describeWarehouseTable',
    typeof toolDescribeWarehouseTableArgsSchema,
    typeof toolDescribeWarehouseTableArgsSchema,
    typeof toolDescribeWarehouseTableOutputSchema
> = defineTool({
    name: 'describeWarehouseTable',
    title: 'Describe warehouse table',
    description: TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDescribeWarehouseTableArgsSchema,
    agent: { outputSchema: toolDescribeWarehouseTableOutputSchema },
});

export const listKnowledgeDocumentsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listKnowledgeDocuments',
    typeof toolListKnowledgeDocumentsArgsSchema,
    typeof toolListKnowledgeDocumentsArgsSchema,
    typeof toolListKnowledgeDocumentsOutputSchema
> = defineTool({
    name: 'listKnowledgeDocuments',
    title: 'List knowledge documents',
    description: TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListKnowledgeDocumentsArgsSchema,
    agent: { outputSchema: toolListKnowledgeDocumentsOutputSchema },
});

export const getKnowledgeDocumentContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getKnowledgeDocumentContent',
    typeof toolGetKnowledgeDocumentContentArgsSchema,
    typeof toolGetKnowledgeDocumentContentArgsSchema,
    typeof toolGetKnowledgeDocumentContentOutputSchema
> = defineTool({
    name: 'getKnowledgeDocumentContent',
    title: 'Get knowledge document content',
    description: TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetKnowledgeDocumentContentArgsSchema,
    agent: { outputSchema: toolGetKnowledgeDocumentContentOutputSchema },
});

export const readPinnedThreadToolDefinition: ToolDefinitionWithoutMcpOutput<
    'readPinnedThread',
    typeof toolReadPinnedThreadArgsSchema,
    typeof toolReadPinnedThreadArgsSchema,
    typeof toolReadPinnedThreadOutputSchema
> = defineTool({
    name: 'readPinnedThread',
    title: 'Read pinned conversation',
    description: TOOL_READ_PINNED_THREAD_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolReadPinnedThreadArgsSchema,
    agent: { outputSchema: toolReadPinnedThreadOutputSchema },
});

const submitResearchReportOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({ status: z.enum(['success', 'error']) }),
});

export const AI_DEEP_RESEARCH_REPORT_TOOL_NAME = 'submitResearchReport';

export const submitResearchReportToolDefinition: ToolDefinitionWithoutMcpOutput<
    typeof AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    typeof aiDeepResearchReportInputSchema,
    typeof aiDeepResearchReportInputSchema,
    typeof submitResearchReportOutputSchema
> = defineTool({
    name: AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    title: 'Submit research report',
    description:
        'Save the best current Deep Research report. Submit once useful findings are available and again when the investigation is complete.',
    availability: ['agent'],
    inputSchema: aiDeepResearchReportInputSchema,
    agent: {
        outputSchema: submitResearchReportOutputSchema,
    },
});

export const AI_DEEP_RESEARCH_DELEGATE_TOOL_NAME = 'delegateResearchTask';

export const delegateResearchTaskToolDefinition: ToolDefinitionWithoutMcpOutput<
    typeof AI_DEEP_RESEARCH_DELEGATE_TOOL_NAME,
    typeof aiDeepResearchWorkerTaskInputSchema,
    typeof aiDeepResearchWorkerTaskInputSchema,
    typeof submitResearchReportOutputSchema
> = defineTool({
    name: AI_DEEP_RESEARCH_DELEGATE_TOOL_NAME,
    title: 'Delegate a research task',
    description: `Hand one narrow data question to an isolated worker with warehouse-only tools and get back a bounded findings packet. Use it only when the task is genuinely separable from your own line of investigation; at most ${AI_DEEP_RESEARCH_MAX_WORKERS} delegations are available per run.`,
    availability: ['agent'],
    inputSchema: aiDeepResearchWorkerTaskInputSchema,
    agent: {
        outputSchema: submitResearchReportOutputSchema,
    },
});

export const AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME =
    'submitWorkerFindings';

export const submitWorkerFindingsToolDefinition: ToolDefinitionWithoutMcpOutput<
    typeof AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    typeof aiDeepResearchWorkerFindingsInputSchema,
    typeof aiDeepResearchWorkerFindingsInputSchema,
    typeof submitResearchReportOutputSchema
> = defineTool({
    name: AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    title: 'Submit worker findings',
    description:
        'Submit the bounded findings packet for the single task this worker was given, with the queryUuid of every warehouse query it relied on.',
    availability: ['agent'],
    inputSchema: aiDeepResearchWorkerFindingsInputSchema,
    agent: {
        outputSchema: submitResearchReportOutputSchema,
    },
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findChartsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findCharts',
    typeof toolFindChartsArgsSchema,
    typeof toolFindChartsArgsSchema,
    typeof toolFindChartsOutputSchema
> = defineTool({
    name: 'findCharts',
    title: 'Find charts',
    description: TOOL_FIND_CHARTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindChartsArgsSchema,
    agent: { outputSchema: toolFindChartsOutputSchema },
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findDashboardsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'findDashboards',
    typeof toolFindDashboardsArgsSchema,
    typeof toolFindDashboardsArgsSchema,
    typeof toolFindDashboardsOutputSchema
> = defineTool({
    name: 'findDashboards',
    title: 'Find dashboards',
    description: TOOL_FIND_DASHBOARDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindDashboardsArgsSchema,
    agent: { outputSchema: toolFindDashboardsOutputSchema },
});

export const getLightdashVersionToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getLightdashVersion',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'getLightdashVersion',
    title: 'Get Lightdash version',
    description: 'Get the current Lightdash version',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const listExploresToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listExplores',
    typeof mcpToolListExploresArgsSchema,
    typeof mcpToolListExploresArgsSchema,
    undefined
> = defineTool({
    name: 'listExplores',
    title: 'List explores',
    description: MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: mcpToolListExploresArgsSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const listSkillsToolDefinition: ToolDefinitionWithMcpOutput<
    'listSkills',
    typeof toolListSkillsArgsSchema,
    typeof toolListSkillsArgsSchema,
    undefined,
    typeof toolListSkillsOutputSchema
> = defineTool({
    name: 'listSkills',
    title: 'List Skills',
    description: TOOL_LIST_SKILLS_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: toolListSkillsArgsSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: toolListSkillsOutputSchema,
    },
});

export const readSkillToolDefinition: ToolDefinitionWithMcpOutput<
    'readSkill',
    typeof toolLoadSkillMcpArgsSchema,
    typeof toolLoadSkillMcpArgsSchema,
    undefined,
    typeof toolLoadSkillOutputSchemaMcp
> = defineTool({
    name: 'readSkill',
    title: 'Read Skill',
    description: TOOL_LOAD_SKILL_DESCRIPTION_MCP,
    availability: ['mcp'],
    inputSchema: toolLoadSkillMcpArgsSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: toolLoadSkillOutputSchemaMcp,
    },
});

export const readSkillResourceToolDefinition: ToolDefinitionWithMcpOutput<
    'readSkillResource',
    typeof toolLoadSkillResourceArgsSchema,
    typeof toolLoadSkillResourceArgsSchema,
    undefined,
    typeof toolLoadSkillResourceOutputSchema
> = defineTool({
    name: 'readSkillResource',
    title: 'Read Skill Resource',
    description: TOOL_LOAD_SKILL_RESOURCE_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: toolLoadSkillResourceArgsSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: toolLoadSkillResourceOutputSchema,
    },
});

export const mcpListProjectsToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listProjects',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'listProjects',
    title: 'List projects',
    description:
        'List all accessible projects in the organization. Projects contain explores, fields, and content. Prefer get_context for bootstrap, then pass the selected projectUuid explicitly to every project-scoped operation. Each project includes a "type": prefer DEFAULT projects, which are live production environments. PREVIEW projects are ephemeral CI/PR environments that may be decommissioned — their warehouse credentials are often gone, so queries can fail with 403 errors even when the schema is still visible. Only select a PREVIEW project if the user explicitly asks for it.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const getContextToolDefinition: ToolDefinitionWithMcpOutput<
    'getContext',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined,
    typeof mcpGetContextOutputSchema
> = defineTool({
    name: 'getContext',
    title: 'Get context',
    description:
        'Call this first to discover available projects, the agents you can access in each project, and Lightdash-configured context. Pass the selected projectUuid to every project-scoped tool call and an available agentUuid when agent-specific scope is desired. This tool reports context but does not establish implicit execution state.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpGetContextOutputSchema,
    },
});

/** @deprecated Use getContextToolDefinition and explicit projectUuid arguments. */
export const setProjectToolDefinition = defineTool({
    name: 'setProject',
    title: 'Set project',
    description:
        'Set the configured project context. Most tools (list_explores, MCP schema-discovery tools, run_metric_query, etc.) also require its projectUuid explicitly. Setting a project clears any previously selected agent, since agents are scoped to a project. After setting a project, prefer route_agent to auto-select the best agent for each request and pass its returned agentUuid explicitly to subsequent scoped tools; use list_agents and set_agent only for manual override.',
    availability: ['mcp'],
    inputSchema: z.object({
        projectUuid: z.string(),
        tags: z.array(z.string()).optional(),
    }),
    mcp: { annotations: contextWriteAnnotations },
});

/** @deprecated Use getContextToolDefinition. */
export const getCurrentProjectToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getCurrentProject',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'getCurrentProject',
    title: 'Get current project (deprecated)',
    description:
        '@deprecated Use get_context instead. Returns legacy shared project context for older clients.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const listAgentsToolDefinition = defineTool({
    name: 'listAgents',
    title: 'List agents',
    description:
        'List accessible AI agents for the required projectUuid. Each agent is pre-configured with specific explores, tags, verified questions, and instructions that define its domain expertise. Prefer route_agent for automatic selection.',
    availability: ['mcp'],
    inputSchema: z.object({
        projectUuid: z.string().optional(),
    }),
    mcp: { annotations: readOnlyAnnotations },
});

export const routeAgentToolDefinition: ToolDefinitionWithMcpOutput<
    'routeAgent',
    typeof routeAgentArgsSchema,
    typeof routeAgentArgsSchema,
    undefined,
    typeof routeAgentStructuredOutputSchema
> = defineTool({
    name: 'routeAgent',
    title: 'Route agent',
    description:
        'Select the best AI agent for a user request within the required projectUuid when agent-specific scope is useful and routing is available. Pass the returned agentUuid explicitly to subsequent scoped tools. If routing is unavailable, use list_agents and set_agent for manual selection; omit agentUuid when full project scope is desired. Also updates shared agent context for clients that use it.',
    availability: ['mcp'],
    inputSchema: routeAgentArgsSchema,
    mcp: {
        annotations: writeAnnotations,
        structuredContentSchema: routeAgentStructuredOutputSchema,
    },
});

/** @deprecated Use routeAgentToolDefinition and explicit agentUuid arguments. */
export const setAgentToolDefinition = defineTool({
    name: 'setAgent',
    title: 'Set agent',
    description:
        "Manually select an AI agent for the required projectUuid. Prefer route_agent for default automatic selection; use this when you need to override that choice explicitly. Returns the agent's full context including: explores it has access to, space restrictions, verified questions (curated example queries that demonstrate correct usage of the data model), and custom instructions. Pass the agentUuid explicitly to subsequent scoped tools and use this context to guide them — prefer the agent's explores when calling MCP schema-discovery tools, reference verified questions as patterns for building queries with run_metric_query, and follow the agent's instructions for domain-specific conventions.",
    availability: ['mcp'],
    inputSchema: z.object({
        agentUuid: z.string(),
    }),
    mcp: { annotations: contextWriteAnnotations },
});

/** @deprecated Omit agentUuid from project-scoped tool calls. */
export const clearAgentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'clearAgent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'clearAgent',
    title: 'Clear agent (deprecated)',
    description:
        '@deprecated Omit agentUuid from scoped tool calls instead. Clears legacy shared agent context for older clients only.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: contextWriteAnnotations },
});

/** @deprecated Use getContextToolDefinition or routeAgentToolDefinition. */
export const getCurrentAgentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'getCurrentAgent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'getCurrentAgent',
    title: 'Get current agent (deprecated)',
    description:
        '@deprecated Use get_context for legacy configured context or route_agent for an explicit agent selection.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const listVerifiedContentToolDefinition: ToolDefinitionWithoutMcpOutput<
    'listVerifiedContent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    undefined
> = defineTool({
    name: 'listVerifiedContent',
    title: 'List verified content',
    description:
        'List all verified charts and dashboards in the required projectUuid. Verified content has been reviewed and marked as trusted — use this to discover reference examples of sanctioned metrics and visualizations when building new content. Each item includes contentType (chart or dashboard), contentUuid, name, description, space, view count, last update time, and verification metadata (who verified it and when); charts also include chartKind and exploreName. To learn the full structure of a verified item (dimensions, metrics, filters), drill into it with find_content or MCP schema-discovery tools on its explore.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { annotations: readOnlyAnnotations },
});

export const runAiWritebackToolDefinition: ToolDefinitionWithMcpOutput<
    'runAiWriteback',
    typeof mcpRunAiWritebackArgsSchema,
    typeof mcpRunAiWritebackArgsSchema,
    undefined,
    typeof mcpRunAiWritebackStructuredOutputSchema
> = defineTool({
    name: 'runAiWriteback',
    title: 'Run AI writeback',
    description: MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: mcpRunAiWritebackArgsSchema,
    mcp: {
        annotations: destructiveExternalWriteAnnotations,
        structuredContentSchema: mcpRunAiWritebackStructuredOutputSchema,
    },
});

export const getAiWritebackStatusToolDefinition: ToolDefinitionWithMcpOutput<
    'getAiWritebackStatus',
    typeof mcpGetAiWritebackStatusArgsSchema,
    typeof mcpGetAiWritebackStatusArgsSchema,
    undefined,
    typeof mcpGetAiWritebackStatusStructuredOutputSchema
> = defineTool({
    name: 'getAiWritebackStatus',
    title: 'Get AI writeback status',
    description: MCP_TOOL_GET_AI_WRITEBACK_STATUS_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: mcpGetAiWritebackStatusArgsSchema,
    mcp: {
        annotations: readOnlyAnnotations,
        structuredContentSchema: mcpGetAiWritebackStatusStructuredOutputSchema,
    },
});

type AgentToolDefinitionsByName = {
    findExplores: typeof findExploresToolDefinition;
    findCustomChartTypes: typeof findCustomChartTypesToolDefinition;
    findFields: typeof findFieldsToolDefinition;
    searchSemanticLayer: typeof searchSemanticLayerToolDefinition;
    analyzeFieldImpact: typeof analyzeFieldImpactToolDefinition;
    findContent: typeof findContentToolDefinition;
    searchFieldValues: typeof searchFieldValuesToolDefinition;
    generateVisualization: typeof generateVisualizationToolDefinition;
    runQuery: typeof runQueryToolDefinition;
    runSql: typeof runSqlToolDefinition;
    runComposerQueries: typeof runComposerQueriesToolDefinition;
    discoverFields: typeof discoverFieldsToolDefinition;
    grepFields: typeof grepFieldsToolDefinition;
    getMetadata: typeof getMetadataToolDefinition;
    generateDashboard: typeof generateDashboardToolDefinition;
    generateHashes: typeof generateHashesToolDefinition;
    generateUuids: typeof generateUuidsToolDefinition;
    getDashboardCharts: typeof getDashboardChartsToolDefinition;
    readContent: typeof readContentToolDefinition;
    resolveUrl: typeof resolveUrlToolDefinition;
    editContent: typeof editContentToolDefinition;
    createContent: typeof createContentToolDefinition;
    createScheduledDelivery: typeof createScheduledDeliveryToolDefinition;
    updateUserName: typeof updateUserNameToolDefinition;
    runContentQuery: typeof runContentQueryToolDefinition;
    listContent: typeof listContentToolDefinition;
    loadSkill: typeof loadSkillToolDefinition;
    loadProjectContext: typeof loadProjectContextToolDefinition;
    loadMcpTools: typeof loadMcpToolsToolDefinition;
    generateDataApp: typeof generateDataAppToolDefinition;
    iterateDataApp: typeof iterateDataAppToolDefinition;
    editDbtProject: typeof editDbtProjectToolDefinition;
    editProjectContext: typeof editProjectContextToolDefinition;
    editRepo: typeof editRepoToolDefinition;
    syncDbtProject: typeof syncDbtProjectToolDefinition;
    exploreRepo: typeof exploreRepoToolDefinition;
    discoverRepos: typeof discoverReposToolDefinition;
    listWorkstreams: typeof listWorkstreamsToolDefinition;
    closePullRequest: typeof closePullRequestToolDefinition;
    getPullRequestDiff: typeof getPullRequestDiffToolDefinition;
    setupPreviewDeploy: typeof setupPreviewDeployToolDefinition;
    runSavedChart: typeof runSavedChartToolDefinition;
    listWarehouseTables: typeof listWarehouseTablesToolDefinition;
    describeWarehouseTable: typeof describeWarehouseTableToolDefinition;
    listKnowledgeDocuments: typeof listKnowledgeDocumentsToolDefinition;
    getKnowledgeDocumentContent: typeof getKnowledgeDocumentContentToolDefinition;
    readPinnedThread: typeof readPinnedThreadToolDefinition;
    submitResearchReport: typeof submitResearchReportToolDefinition;
    delegateResearchTask: typeof delegateResearchTaskToolDefinition;
    submitWorkerFindings: typeof submitWorkerFindingsToolDefinition;
    findCharts: typeof findChartsToolDefinition;
    findDashboards: typeof findDashboardsToolDefinition;
    listProjects: typeof listProjectsToolDefinition;
    getProjectInfo: typeof getProjectInfoToolDefinition;
};

export const agentToolDefinitionsByName: AgentToolDefinitionsByName = {
    findExplores: findExploresToolDefinition,
    findCustomChartTypes: findCustomChartTypesToolDefinition,
    findFields: findFieldsToolDefinition,
    searchSemanticLayer: searchSemanticLayerToolDefinition,
    analyzeFieldImpact: analyzeFieldImpactToolDefinition,
    findContent: findContentToolDefinition,
    searchFieldValues: searchFieldValuesToolDefinition,
    generateVisualization: generateVisualizationToolDefinition,
    runQuery: runQueryToolDefinition,
    runSql: runSqlToolDefinition,
    runComposerQueries: runComposerQueriesToolDefinition,
    discoverFields: discoverFieldsToolDefinition,
    grepFields: grepFieldsToolDefinition,
    getMetadata: getMetadataToolDefinition,
    generateDashboard: generateDashboardToolDefinition,
    generateHashes: generateHashesToolDefinition,
    generateUuids: generateUuidsToolDefinition,
    getDashboardCharts: getDashboardChartsToolDefinition,
    readContent: readContentToolDefinition,
    resolveUrl: resolveUrlToolDefinition,
    editContent: editContentToolDefinition,
    createContent: createContentToolDefinition,
    createScheduledDelivery: createScheduledDeliveryToolDefinition,
    updateUserName: updateUserNameToolDefinition,
    runContentQuery: runContentQueryToolDefinition,
    listContent: listContentToolDefinition,
    loadSkill: loadSkillToolDefinition,
    loadProjectContext: loadProjectContextToolDefinition,
    loadMcpTools: loadMcpToolsToolDefinition,
    generateDataApp: generateDataAppToolDefinition,
    iterateDataApp: iterateDataAppToolDefinition,
    editDbtProject: editDbtProjectToolDefinition,
    editProjectContext: editProjectContextToolDefinition,
    editRepo: editRepoToolDefinition,
    syncDbtProject: syncDbtProjectToolDefinition,
    exploreRepo: exploreRepoToolDefinition,
    discoverRepos: discoverReposToolDefinition,
    listWorkstreams: listWorkstreamsToolDefinition,
    closePullRequest: closePullRequestToolDefinition,
    getPullRequestDiff: getPullRequestDiffToolDefinition,
    setupPreviewDeploy: setupPreviewDeployToolDefinition,
    runSavedChart: runSavedChartToolDefinition,
    listWarehouseTables: listWarehouseTablesToolDefinition,
    describeWarehouseTable: describeWarehouseTableToolDefinition,
    listKnowledgeDocuments: listKnowledgeDocumentsToolDefinition,
    getKnowledgeDocumentContent: getKnowledgeDocumentContentToolDefinition,
    readPinnedThread: readPinnedThreadToolDefinition,
    submitResearchReport: submitResearchReportToolDefinition,
    delegateResearchTask: delegateResearchTaskToolDefinition,
    submitWorkerFindings: submitWorkerFindingsToolDefinition,
    findCharts: findChartsToolDefinition,
    findDashboards: findDashboardsToolDefinition,
    listProjects: listProjectsToolDefinition,
    getProjectInfo: getProjectInfoToolDefinition,
};

export type AgentToolName = keyof typeof agentToolDefinitionsByName;

export const isAgentToolName = (toolName: string): toolName is AgentToolName =>
    Object.prototype.hasOwnProperty.call(agentToolDefinitionsByName, toolName);

export const builtInToolDefinitions: readonly ToolDefinitionInstance[] = [
    findExploresToolDefinition,
    findCustomChartTypesToolDefinition,
    findFieldsToolDefinition,
    searchSemanticLayerToolDefinition,
    analyzeFieldImpactToolDefinition,
    findContentToolDefinition,
    searchFieldValuesToolDefinition,
    generateVisualizationToolDefinition,
    runQueryToolDefinition,
    runSqlToolDefinition,
    runComposerQueriesToolDefinition,
    getQueryResultToolDefinition,
    renderChartToolDefinition,
    discoverFieldsToolDefinition,
    grepFieldsToolDefinition,
    getMetadataToolDefinition,
    generateDashboardToolDefinition,
    generateHashesToolDefinition,
    generateUuidsToolDefinition,
    getDashboardChartsToolDefinition,
    readContentToolDefinition,
    resolveUrlToolDefinition,
    editContentToolDefinition,
    createContentToolDefinition,
    createScheduledDeliveryToolDefinition,
    updateUserNameToolDefinition,
    runContentQueryToolDefinition,
    listContentToolDefinition,
    loadSkillToolDefinition,
    loadProjectContextToolDefinition,
    loadMcpToolsToolDefinition,
    generateDataAppToolDefinition,
    iterateDataAppToolDefinition,
    editDbtProjectToolDefinition,
    editProjectContextToolDefinition,
    editRepoToolDefinition,
    syncDbtProjectToolDefinition,
    exploreRepoToolDefinition,
    discoverReposToolDefinition,
    listWorkstreamsToolDefinition,
    closePullRequestToolDefinition,
    getPullRequestDiffToolDefinition,
    setupPreviewDeployToolDefinition,
    runSavedChartToolDefinition,
    listWarehouseTablesToolDefinition,
    describeWarehouseTableToolDefinition,
    listKnowledgeDocumentsToolDefinition,
    getKnowledgeDocumentContentToolDefinition,
    readPinnedThreadToolDefinition,
    submitResearchReportToolDefinition,
    delegateResearchTaskToolDefinition,
    submitWorkerFindingsToolDefinition,
    findChartsToolDefinition,
    findDashboardsToolDefinition,
    getLightdashVersionToolDefinition,
    listExploresToolDefinition,
    listSkillsToolDefinition,
    readSkillToolDefinition,
    readSkillResourceToolDefinition,
    listProjectsToolDefinition,
    mcpListProjectsToolDefinition,
    getProjectInfoToolDefinition,
    getContextToolDefinition,
    setProjectToolDefinition,
    getCurrentProjectToolDefinition,
    listAgentsToolDefinition,
    routeAgentToolDefinition,
    setAgentToolDefinition,
    clearAgentToolDefinition,
    getCurrentAgentToolDefinition,
    listVerifiedContentToolDefinition,
    runAiWritebackToolDefinition,
    getAiWritebackStatusToolDefinition,
] as const;

export type BuiltInToolDefinition = ToolDefinitionInstance;

export const agentToolDefinitions: readonly ToolDefinitionInstance[] =
    builtInToolDefinitions.filter((tool) =>
        tool.availability.includes('agent'),
    );

export type AgentToolDefinition = (typeof agentToolDefinitions)[number];

export const mcpToolDefinitions: readonly ToolDefinitionInstance[] =
    builtInToolDefinitions.filter((tool) => tool.availability.includes('mcp'));

export type McpToolDefinition = (typeof mcpToolDefinitions)[number];

export const agentToolNames = agentToolDefinitions.map((tool) => tool.name) as [
    string,
    ...string[],
];

export const mcpToolNames = mcpToolDefinitions.map(
    (tool) => tool.for('mcp').name,
) as [string, ...string[]];

export const mcpToolDefinitionsByName = Object.fromEntries(
    mcpToolDefinitions.map((tool) => [tool.for('mcp').name, tool]),
) as Record<string, McpToolDefinition>;
