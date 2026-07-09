import { z } from 'zod';
import {
    MCP_TOOL_GET_AI_WRITEBACK_STATUS_DESCRIPTION,
    MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    mcpGetAiWritebackStatusArgsSchema,
    mcpGetAiWritebackStatusStructuredOutputSchema,
    mcpRunAiWritebackArgsSchema,
    mcpRunAiWritebackStructuredOutputSchema,
} from '../../../aiWriteback/types';
import {
    defineTool,
    type AgentAndMcpAvailability,
    type AgentOnlyAvailability,
    type McpOnlyAvailability,
    type McpToolAnnotations,
    type ToolDefinition,
    type ToolJsonValue,
    type ToolOutput,
    type ToolStructuredContentSchema,
} from '../defineTool';
import { CROSS_REFERENCED_TOOL_NAMES } from './discoveryToolNames';
import {
    MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    mcpToolListExploresArgsSchema,
} from './mcpToolListExploresArgs';
import {
    TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
    toolAnalyzeFieldImpactArgsSchema,
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
} from './toolClosePullRequestArgs';
import {
    TOOL_CREATE_CONTENT_DESCRIPTION,
    toolCreateContentArgsSchema,
} from './toolCreateContentArgs';
import {
    TOOL_DASHBOARD_DESCRIPTION,
    toolDashboardArgsSchema,
} from './toolDashboardArgs';
import {
    TOOL_DASHBOARD_V2_DESCRIPTION,
    toolDashboardV2ArgsSchema,
} from './toolDashboardV2Args';
import {
    TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    toolDescribeWarehouseTableArgsSchema,
} from './toolDescribeWarehouseTableArgs';
import {
    DISCOVER_FIELDS_DESCRIPTION,
    discoverFieldsInputSchema,
} from './toolDiscoverFieldsArgs';
import {
    TOOL_DISCOVER_REPOS_DESCRIPTION,
    toolDiscoverReposArgsSchema,
} from './toolDiscoverReposArgs';
import {
    TOOL_EDIT_CONTENT_DESCRIPTION,
    toolEditContentArgsSchema,
} from './toolEditContentArgs';
import {
    TOOL_EDIT_DBT_PROJECT_DESCRIPTION,
    toolEditDbtProjectArgsSchema,
} from './toolEditDbtProjectArgs';
import {
    TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION,
    toolEditProjectContextArgsSchema,
} from './toolEditProjectContextArgs';
import {
    TOOL_EDIT_REPO_DESCRIPTION,
    toolEditRepoArgsSchema,
} from './toolEditRepoArgs';
import {
    TOOL_EXPLORE_REPO_DESCRIPTION,
    toolExploreRepoArgsSchema,
} from './toolExploreRepoArgs';
import {
    TOOL_FIND_CHARTS_DESCRIPTION,
    toolFindChartsArgsSchema,
} from './toolFindChartsArgs';
import {
    TOOL_FIND_CONTENT_DESCRIPTION,
    toolFindContentArgsSchema,
} from './toolFindContentArgs';
import {
    TOOL_FIND_DASHBOARDS_DESCRIPTION,
    toolFindDashboardsArgsSchema,
} from './toolFindDashboardsArgs';
import {
    findExploresResultSchema,
    TOOL_FIND_EXPLORES_DESCRIPTION,
    toolFindExploresArgsSchemaV3,
} from './toolFindExploresArgs';
import {
    findFieldsResultSchema,
    TOOL_FIND_FIELDS_DESCRIPTION,
    toolFindFieldsArgsSchema,
} from './toolFindFieldsArgs';
import {
    TOOL_GENERATE_HASHES_DESCRIPTION,
    toolGenerateHashesArgsSchema,
} from './toolGenerateHashesArgs';
import {
    TOOL_GENERATE_UUIDS_DESCRIPTION,
    toolGenerateUuidsArgsSchema,
} from './toolGenerateUuidsArgs';
import {
    TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION,
    toolGetDashboardChartsArgsSchema,
} from './toolGetDashboardChartsArgs';
import {
    TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION,
    toolGetKnowledgeDocumentContentArgsSchema,
} from './toolGetKnowledgeDocumentContentArgs';
import {
    GET_METADATA_DESCRIPTION,
    getMetadataInputSchema,
    getMetadataResultSchema,
} from './toolGetMetadataArgs';
import {
    TOOL_GET_PROJECT_INFO_DESCRIPTION,
    toolGetProjectInfoArgsSchema,
} from './toolGetProjectInfoArgs';
import {
    TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION,
    toolGetPullRequestDiffArgsSchema,
} from './toolGetPullRequestDiffArgs';
import {
    TOOL_GET_QUERY_RESULT_DESCRIPTION,
    toolGetQueryResultArgsSchema,
} from './toolGetQueryResultArgs';
import {
    GREP_FIELDS_DESCRIPTION,
    grepFieldsInputSchema,
    grepFieldsResultSchema,
} from './toolGrepFieldsArgs';
import {
    TOOL_IMPROVE_CONTEXT_DESCRIPTION,
    toolImproveContextArgsSchema,
} from './toolImproveContextArgs';
import {
    TOOL_LIST_CONTENT_DESCRIPTION,
    toolListContentArgsSchema,
} from './toolListContentArgs';
import {
    TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    toolListKnowledgeDocumentsArgsSchema,
} from './toolListKnowledgeDocumentsArgs';
import {
    TOOL_LIST_PROJECTS_DESCRIPTION,
    toolListProjectsArgsSchema,
} from './toolListProjectsArgs';
import {
    TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    toolListWarehouseTablesArgsSchema,
} from './toolListWarehouseTablesArgs';
import {
    TOOL_LIST_WORKSTREAMS_DESCRIPTION,
    toolListWorkstreamsArgsSchema,
} from './toolListWorkstreamsArgs';
import {
    TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION,
    toolLoadProjectContextArgsSchema,
} from './toolLoadProjectContextArgs';
import {
    TOOL_LOAD_SKILL_DESCRIPTION,
    toolLoadSkillArgsSchema,
} from './toolLoadSkillArgs';
import {
    TOOL_PROPOSE_CHANGE_DESCRIPTION,
    toolProposeChangeArgsSchema,
} from './toolProposeChangeArgs';
import {
    mcpGetQueryResultStructuredOutputSchema,
    mcpRenderChartStructuredOutputSchema,
    mcpRunMetricQueryStructuredOutputSchema,
    mcpRunSqlStructuredOutputSchema,
} from './toolQueryResultSchemas';
import {
    TOOL_READ_CONTENT_DESCRIPTION,
    toolReadContentArgsSchema,
} from './toolReadContentArgs';
import {
    TOOL_READ_PINNED_THREAD_DESCRIPTION,
    toolReadPinnedThreadArgsSchema,
} from './toolReadPinnedThreadArgs';
import {
    TOOL_RUN_CONTENT_QUERY_DESCRIPTION,
    toolRunContentQueryArgsSchema,
} from './toolRunContentQueryArgs';
import {
    TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    toolRunMetricQueryArgsSchema,
} from './toolRunMetricQueryArgs';
import {
    TOOL_RENDER_CHART_DESCRIPTION,
    TOOL_RUN_QUERY_DESCRIPTION,
    toolRenderChartArgsSchema,
    toolRenderChartArgsSchemaTransformed,
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
} from './toolRunQueryArgs';
import {
    TOOL_RUN_SAVED_CHART_DESCRIPTION,
    toolRunSavedChartArgsSchema,
} from './toolRunSavedChartArgs';
import {
    buildRunSqlDescription,
    DEFAULT_RUN_SQL_LIMIT,
    DEFAULT_RUN_SQL_MAX_LIMIT,
    toolRunSqlArgsSchema,
} from './toolRunSqlArgs';
import {
    TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    toolSearchFieldValuesArgsSchema,
} from './toolSearchFieldValuesArgs';
import {
    TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION,
    toolSearchSemanticLayerArgsSchema,
} from './toolSearchSemanticLayerArgs';
import {
    TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION,
    toolSetupPreviewDeployArgsSchema,
} from './toolSetupPreviewDeployArgs';
import {
    TOOL_SYNC_DBT_PROJECT_DESCRIPTION,
    toolSyncDbtProjectArgsSchema,
} from './toolSyncDbtProjectArgs';
import {
    TOOL_TABLE_VIZ_DESCRIPTION,
    toolTableVizArgsSchema,
    toolTableVizArgsSchemaTransformed,
} from './toolTableVizArgs';
import {
    TOOL_TIME_SERIES_VIZ_DESCRIPTION,
    toolTimeSeriesArgsSchema,
    toolTimeSeriesArgsSchemaTransformed,
} from './toolTimeSeriesArgs';
import {
    TOOL_VERTICAL_BAR_VIZ_DESCRIPTION,
    toolVerticalBarArgsSchema,
    toolVerticalBarArgsSchemaTransformed,
} from './toolVerticalBarArgs';

const readOnlyAnnotations: McpToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
};

const writeAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
};

const contextWriteAnnotations: McpToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
};

const emptyInputSchema = z.object({});

const toolOutputMetadataSchema = z.record(z.unknown()).optional();
const toolJsonValueSchema: z.ZodType<ToolJsonValue> = z
    .object({})
    .passthrough();

const toolOutputJsonItemSchema = z.object({
    status: z.literal('success'),
    type: z.literal('json'),
    result: toolJsonValueSchema,
    metadata: toolOutputMetadataSchema,
});

const toolOutputCsvItemSchema = z.object({
    status: z.literal('success'),
    type: z.literal('csv'),
    result: z.string(),
    metadata: toolOutputMetadataSchema,
});

const toolOutputStringItemSchema = z.object({
    status: z.literal('success'),
    type: z.literal('string'),
    result: z.string(),
    metadata: toolOutputMetadataSchema,
});

const toolOutputErrorSchema = z.object({
    status: z.literal('error'),
    error: z.string(),
    metadata: toolOutputMetadataSchema,
});

const toolOutputSuccessItemSchema = z.union([
    toolOutputJsonItemSchema,
    toolOutputCsvItemSchema,
    toolOutputStringItemSchema,
]);

const toolOutputItemSchema = z.union([
    toolOutputJsonItemSchema,
    toolOutputCsvItemSchema,
    toolOutputStringItemSchema,
    toolOutputErrorSchema,
]);

// The envelope stays loose at runtime (json results are passthrough); the
// structured-content schema is the MCP-facing contract: it is advertised in
// tools/list and the SDK validates every structuredContent against it.
export function buildToolOutputSchema(): z.ZodType<ToolOutput> & {
    structuredContentSchema: undefined;
};
export function buildToolOutputSchema<
    TStructured extends ToolStructuredContentSchema,
>(
    structuredContentSchema: TStructured,
): z.ZodType<ToolOutput> & { structuredContentSchema: TStructured };
export function buildToolOutputSchema<
    TStructured extends ToolStructuredContentSchema,
>(structuredContentSchema?: TStructured) {
    const envelopeSchema: z.ZodType<ToolOutput> = z.union([
        toolOutputItemSchema,
        z.array(toolOutputSuccessItemSchema),
    ]);
    return Object.assign(envelopeSchema, { structuredContentSchema });
}

export const toolOutputSchema = buildToolOutputSchema();

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

const setProjectArgsSchema = z.object({
    projectUuid: z.string(),
    tags: z.array(z.string()).optional(),
});

const listAgentsArgsSchema = z.object({
    projectUuid: z.string().optional(),
});

const setAgentArgsSchema = z.object({
    agentUuid: z.string(),
});

const findExploresOutputSchema = buildToolOutputSchema(
    findExploresResultSchema,
);

export const findExploresToolDefinition: ToolDefinition<
    'findExplores',
    typeof toolFindExploresArgsSchemaV3,
    typeof toolFindExploresArgsSchemaV3,
    typeof findExploresOutputSchema,
    AgentAndMcpAvailability<'find_explores'>
> = defineTool({
    name: 'findExplores',
    title: 'Find explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'find_explores',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolFindExploresArgsSchemaV3,
    outputSchema: findExploresOutputSchema,
});

const findFieldsOutputSchema = buildToolOutputSchema(findFieldsResultSchema);

export const findFieldsToolDefinition: ToolDefinition<
    'findFields',
    typeof toolFindFieldsArgsSchema,
    typeof toolFindFieldsArgsSchema,
    typeof findFieldsOutputSchema,
    AgentAndMcpAvailability<'find_fields'>
> = defineTool({
    name: 'findFields',
    title: 'Find fields',
    description: TOOL_FIND_FIELDS_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'find_fields',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolFindFieldsArgsSchema,
    outputSchema: findFieldsOutputSchema,
});

export const searchSemanticLayerToolDefinition: ToolDefinition<
    'searchSemanticLayer',
    typeof toolSearchSemanticLayerArgsSchema,
    typeof toolSearchSemanticLayerArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'searchSemanticLayer',
    title: 'Search semantic layer',
    description: TOOL_SEARCH_SEMANTIC_LAYER_DESCRIPTION,
    // Agent-only for now: the tool is gated by FeatureFlags.SearchSemanticLayer
    // on the agent ToolSet, so we don't expose it on the (un-gated) MCP surface.
    availability: { runtime: 'agent' },
    inputSchema: toolSearchSemanticLayerArgsSchema,
    outputSchema: toolOutputSchema,
});

export const analyzeFieldImpactToolDefinition: ToolDefinition<
    'analyzeFieldImpact',
    typeof toolAnalyzeFieldImpactArgsSchema,
    typeof toolAnalyzeFieldImpactArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'analyzeFieldImpact',
    title: 'Analyze field impact',
    description: TOOL_ANALYZE_FIELD_IMPACT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolAnalyzeFieldImpactArgsSchema,
    outputSchema: toolOutputSchema,
});

export const findContentToolDefinition: ToolDefinition<
    'findContent',
    typeof toolFindContentArgsSchema,
    typeof toolFindContentArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'find_content'>
> = defineTool({
    name: CROSS_REFERENCED_TOOL_NAMES.findContent.agent,
    title: 'Find content',
    description: TOOL_FIND_CONTENT_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: CROSS_REFERENCED_TOOL_NAMES.findContent.mcp,
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolFindContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const searchFieldValuesToolDefinition: ToolDefinition<
    'searchFieldValues',
    typeof toolSearchFieldValuesArgsSchema,
    typeof toolSearchFieldValuesArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'search_field_values'>
> = defineTool({
    name: 'searchFieldValues',
    title: 'Search field values',
    description: TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'search_field_values',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolSearchFieldValuesArgsSchema,
    outputSchema: toolOutputSchema,
});

export const generateVisualizationToolDefinition: ToolDefinition<
    'generateVisualization',
    typeof toolRunQueryArgsSchema,
    typeof toolRunQueryArgsSchemaTransformed,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: CROSS_REFERENCED_TOOL_NAMES.visualization.agent,
    title: 'Generate visualization',
    description: TOOL_RUN_QUERY_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolRunQueryArgsSchema,
    inputSchemaTransformed: toolRunQueryArgsSchemaTransformed,
    outputSchema: toolOutputSchema,
});

const runQueryOutputSchema = buildToolOutputSchema(
    mcpRunMetricQueryStructuredOutputSchema,
);

export const runQueryToolDefinition: ToolDefinition<
    'runQuery',
    typeof toolRunQueryArgsSchema,
    typeof toolRunQueryArgsSchemaTransformed,
    typeof runQueryOutputSchema,
    AgentAndMcpAvailability<'run_metric_query'>
> = defineTool({
    name: 'runQuery',
    title: 'Run query',
    description: TOOL_RUN_QUERY_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: CROSS_REFERENCED_TOOL_NAMES.visualization.mcp,
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolRunQueryArgsSchema,
    inputSchemaTransformed: toolRunQueryArgsSchemaTransformed,
    outputSchema: runQueryOutputSchema,
});

const runSqlOutputSchema = buildToolOutputSchema(
    mcpRunSqlStructuredOutputSchema,
);

export const runSqlToolDefinition: ToolDefinition<
    'runSql',
    typeof toolRunSqlArgsSchema,
    typeof toolRunSqlArgsSchema,
    typeof runSqlOutputSchema,
    AgentAndMcpAvailability<'run_sql'>
> = defineTool({
    name: 'runSql',
    title: 'Run SQL',
    description: buildRunSqlDescription(
        DEFAULT_RUN_SQL_LIMIT,
        DEFAULT_RUN_SQL_MAX_LIMIT,
    ),
    availability: {
        runtime: 'both',
        mcp: {
            name: 'run_sql',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolRunSqlArgsSchema,
    outputSchema: runSqlOutputSchema,
});

const getQueryResultOutputSchema = buildToolOutputSchema(
    mcpGetQueryResultStructuredOutputSchema,
);

export const getQueryResultToolDefinition: ToolDefinition<
    'getQueryResult',
    typeof toolGetQueryResultArgsSchema,
    typeof toolGetQueryResultArgsSchema,
    typeof getQueryResultOutputSchema,
    McpOnlyAvailability<'get_query_result'>
> = defineTool({
    name: 'getQueryResult',
    title: 'Get query result',
    description: TOOL_GET_QUERY_RESULT_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'get_query_result',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolGetQueryResultArgsSchema,
    outputSchema: getQueryResultOutputSchema,
});

const renderChartOutputSchema = buildToolOutputSchema(
    mcpRenderChartStructuredOutputSchema,
);

export const renderChartToolDefinition: ToolDefinition<
    'renderChart',
    typeof toolRenderChartArgsSchema,
    typeof toolRenderChartArgsSchemaTransformed,
    typeof renderChartOutputSchema,
    McpOnlyAvailability<'render_chart'>
> = defineTool({
    name: 'renderChart',
    title: 'Render chart',
    description: TOOL_RENDER_CHART_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'render_chart',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolRenderChartArgsSchema,
    inputSchemaTransformed: toolRenderChartArgsSchemaTransformed,
    outputSchema: renderChartOutputSchema,
});

/** @deprecated Legacy CSV-only metric query tool. */
export const runMetricQueryToolDefinition: ToolDefinition<
    'runMetricQuery',
    typeof toolRunMetricQueryArgsSchema,
    typeof toolRunMetricQueryArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'runMetricQuery',
    title: 'Run metric query',
    description: TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolRunMetricQueryArgsSchema,
    outputSchema: toolOutputSchema,
});

export const discoverFieldsToolDefinition: ToolDefinition<
    'discoverFields',
    typeof discoverFieldsInputSchema,
    typeof discoverFieldsInputSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'discoverFields',
    title: 'Discover fields',
    description: DISCOVER_FIELDS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: discoverFieldsInputSchema,
    outputSchema: toolOutputSchema,
});

const grepFieldsOutputSchema = buildToolOutputSchema(grepFieldsResultSchema);

export const grepFieldsToolDefinition: ToolDefinition<
    'grepFields',
    typeof grepFieldsInputSchema,
    typeof grepFieldsInputSchema,
    typeof grepFieldsOutputSchema,
    AgentAndMcpAvailability<'grep_fields'>
> = defineTool({
    name: CROSS_REFERENCED_TOOL_NAMES.grepFields.agent,
    title: 'Search fields',
    description: GREP_FIELDS_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: CROSS_REFERENCED_TOOL_NAMES.grepFields.mcp,
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: grepFieldsInputSchema,
    outputSchema: grepFieldsOutputSchema,
});

const getMetadataOutputSchema = buildToolOutputSchema(getMetadataResultSchema);

export const getMetadataToolDefinition: ToolDefinition<
    'getMetadata',
    typeof getMetadataInputSchema,
    typeof getMetadataInputSchema,
    typeof getMetadataOutputSchema,
    AgentAndMcpAvailability<'get_metadata'>
> = defineTool({
    name: CROSS_REFERENCED_TOOL_NAMES.getMetadata.agent,
    title: 'Get metadata',
    description: GET_METADATA_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: CROSS_REFERENCED_TOOL_NAMES.getMetadata.mcp,
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: getMetadataInputSchema,
    outputSchema: getMetadataOutputSchema,
});

export const generateDashboardToolDefinition: ToolDefinition<
    'generateDashboard',
    typeof toolDashboardV2ArgsSchema,
    typeof toolDashboardV2ArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateDashboard',
    title: 'Generate dashboard',
    description: TOOL_DASHBOARD_V2_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolDashboardV2ArgsSchema,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy v1 dashboard tool schema kept for historical tool calls and artifacts. */
export const generateDashboardV1ToolDefinition: ToolDefinition<
    'generateDashboard',
    typeof toolDashboardArgsSchema,
    typeof toolDashboardArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateDashboard',
    title: 'Generate dashboard',
    description: TOOL_DASHBOARD_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolDashboardArgsSchema,
    outputSchema: toolOutputSchema,
});

export const generateUuidsToolDefinition: ToolDefinition<
    'generateUuids',
    typeof toolGenerateUuidsArgsSchema,
    typeof toolGenerateUuidsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateUuids',
    title: 'Generate UUIDs',
    description: TOOL_GENERATE_UUIDS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGenerateUuidsArgsSchema,
    outputSchema: toolOutputSchema,
});

export const generateHashesToolDefinition: ToolDefinition<
    'generateHashes',
    typeof toolGenerateHashesArgsSchema,
    typeof toolGenerateHashesArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateHashes',
    title: 'Generate hashes',
    description: TOOL_GENERATE_HASHES_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGenerateHashesArgsSchema,
    outputSchema: toolOutputSchema,
});

export const getDashboardChartsToolDefinition: ToolDefinition<
    'getDashboardCharts',
    typeof toolGetDashboardChartsArgsSchema,
    typeof toolGetDashboardChartsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'getDashboardCharts',
    title: 'Get dashboard charts',
    description: TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGetDashboardChartsArgsSchema,
    outputSchema: toolOutputSchema,
});

export const readContentToolDefinition: ToolDefinition<
    'readContent',
    typeof toolReadContentArgsSchema,
    typeof toolReadContentArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'read_content'>
> = defineTool({
    name: 'readContent',
    title: 'Read content',
    description: TOOL_READ_CONTENT_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'read_content',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolReadContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const editContentToolDefinition: ToolDefinition<
    'editContent',
    typeof toolEditContentArgsSchema,
    typeof toolEditContentArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'edit_content'>
> = defineTool({
    name: 'editContent',
    title: 'Edit content',
    description: TOOL_EDIT_CONTENT_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'edit_content',
            annotations: writeAnnotations,
        },
    },
    inputSchema: toolEditContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const createContentToolDefinition: ToolDefinition<
    'createContent',
    typeof toolCreateContentArgsSchema,
    typeof toolCreateContentArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'create_content'>
> = defineTool({
    name: 'createContent',
    title: 'Create content',
    description: TOOL_CREATE_CONTENT_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'create_content',
            annotations: writeAnnotations,
        },
    },
    inputSchema: toolCreateContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const runContentQueryToolDefinition: ToolDefinition<
    'runContentQuery',
    typeof toolRunContentQueryArgsSchema,
    typeof toolRunContentQueryArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'runContentQuery',
    title: 'Run content query',
    description: TOOL_RUN_CONTENT_QUERY_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolRunContentQueryArgsSchema,
    outputSchema: toolOutputSchema,
});

export const listContentToolDefinition: ToolDefinition<
    'listContent',
    typeof toolListContentArgsSchema,
    typeof toolListContentArgsSchema,
    typeof toolOutputSchema,
    AgentAndMcpAvailability<'list_content'>
> = defineTool({
    name: 'listContent',
    title: 'List content',
    description: TOOL_LIST_CONTENT_DESCRIPTION,
    availability: {
        runtime: 'both',
        mcp: {
            name: 'list_content',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolListContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const improveContextToolDefinition: ToolDefinition<
    'improveContext',
    typeof toolImproveContextArgsSchema,
    typeof toolImproveContextArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'improveContext',
    title: 'Improve context',
    description: TOOL_IMPROVE_CONTEXT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolImproveContextArgsSchema,
    outputSchema: toolOutputSchema,
});

export const listProjectsToolDefinition: ToolDefinition<
    'listProjects',
    typeof toolListProjectsArgsSchema,
    typeof toolListProjectsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'listProjects',
    title: 'List projects',
    description: TOOL_LIST_PROJECTS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolListProjectsArgsSchema,
    outputSchema: toolOutputSchema,
});

export const getProjectInfoToolDefinition: ToolDefinition<
    'getProjectInfo',
    typeof toolGetProjectInfoArgsSchema,
    typeof toolGetProjectInfoArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'getProjectInfo',
    title: 'Get project info',
    description: TOOL_GET_PROJECT_INFO_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGetProjectInfoArgsSchema,
    outputSchema: toolOutputSchema,
});

export const loadSkillToolDefinition: ToolDefinition<
    'loadSkill',
    typeof toolLoadSkillArgsSchema,
    typeof toolLoadSkillArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'loadSkill',
    title: 'Load skill',
    description: TOOL_LOAD_SKILL_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolLoadSkillArgsSchema,
    outputSchema: toolOutputSchema,
});

export const loadProjectContextToolDefinition: ToolDefinition<
    'loadProjectContext',
    typeof toolLoadProjectContextArgsSchema,
    typeof toolLoadProjectContextArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'loadProjectContext',
    title: 'Load project context',
    description: TOOL_LOAD_PROJECT_CONTEXT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolLoadProjectContextArgsSchema,
    outputSchema: toolOutputSchema,
});

export const proposeChangeToolDefinition: ToolDefinition<
    'proposeChange',
    typeof toolProposeChangeArgsSchema,
    typeof toolProposeChangeArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'proposeChange',
    title: 'Propose change',
    description: TOOL_PROPOSE_CHANGE_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolProposeChangeArgsSchema,
    outputSchema: toolOutputSchema,
});

export const editDbtProjectToolDefinition: ToolDefinition<
    'editDbtProject',
    typeof toolEditDbtProjectArgsSchema,
    typeof toolEditDbtProjectArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'editDbtProject',
    title: 'Edit dbt project',
    description: TOOL_EDIT_DBT_PROJECT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolEditDbtProjectArgsSchema,
    outputSchema: toolOutputSchema,
});

export const editProjectContextToolDefinition: ToolDefinition<
    'editProjectContext',
    typeof toolEditProjectContextArgsSchema,
    typeof toolEditProjectContextArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'editProjectContext',
    title: 'Edit project context',
    description: TOOL_EDIT_PROJECT_CONTEXT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolEditProjectContextArgsSchema,
    outputSchema: toolOutputSchema,
});

export const editRepoToolDefinition: ToolDefinition<
    'editRepo',
    typeof toolEditRepoArgsSchema,
    typeof toolEditRepoArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'editRepo',
    title: 'Edit repository',
    description: TOOL_EDIT_REPO_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolEditRepoArgsSchema,
    outputSchema: toolOutputSchema,
});

export const syncDbtProjectToolDefinition: ToolDefinition<
    'syncDbtProject',
    typeof toolSyncDbtProjectArgsSchema,
    typeof toolSyncDbtProjectArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'syncDbtProject',
    title: 'Sync dbt project',
    description: TOOL_SYNC_DBT_PROJECT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolSyncDbtProjectArgsSchema,
    outputSchema: toolOutputSchema,
});

export const exploreRepoToolDefinition: ToolDefinition<
    'exploreRepo',
    typeof toolExploreRepoArgsSchema,
    typeof toolExploreRepoArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'exploreRepo',
    title: 'Explore repository',
    description: TOOL_EXPLORE_REPO_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolExploreRepoArgsSchema,
    outputSchema: toolOutputSchema,
});

export const discoverReposToolDefinition: ToolDefinition<
    'discoverRepos',
    typeof toolDiscoverReposArgsSchema,
    typeof toolDiscoverReposArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'discoverRepos',
    title: 'Discover repositories',
    description: TOOL_DISCOVER_REPOS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolDiscoverReposArgsSchema,
    outputSchema: toolOutputSchema,
});

export const listWorkstreamsToolDefinition: ToolDefinition<
    'listWorkstreams',
    typeof toolListWorkstreamsArgsSchema,
    typeof toolListWorkstreamsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'listWorkstreams',
    title: 'List pull requests',
    description: TOOL_LIST_WORKSTREAMS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolListWorkstreamsArgsSchema,
    outputSchema: toolOutputSchema,
});

export const closePullRequestToolDefinition: ToolDefinition<
    'closePullRequest',
    typeof toolClosePullRequestArgsSchema,
    typeof toolClosePullRequestArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'closePullRequest',
    title: 'Close pull request',
    description: TOOL_CLOSE_PULL_REQUEST_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolClosePullRequestArgsSchema,
    outputSchema: toolOutputSchema,
});

export const getPullRequestDiffToolDefinition: ToolDefinition<
    'getPullRequestDiff',
    typeof toolGetPullRequestDiffArgsSchema,
    typeof toolGetPullRequestDiffArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'getPullRequestDiff',
    title: 'Read pull request diff',
    description: TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGetPullRequestDiffArgsSchema,
    outputSchema: toolOutputSchema,
});

export const setupPreviewDeployToolDefinition: ToolDefinition<
    'setupPreviewDeploy',
    typeof toolSetupPreviewDeployArgsSchema,
    typeof toolSetupPreviewDeployArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'setupPreviewDeploy',
    title: 'Set up preview deploys',
    description: TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolSetupPreviewDeployArgsSchema,
    outputSchema: toolOutputSchema,
});

export const runSavedChartToolDefinition: ToolDefinition<
    'runSavedChart',
    typeof toolRunSavedChartArgsSchema,
    typeof toolRunSavedChartArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'runSavedChart',
    title: 'Run saved chart',
    description: TOOL_RUN_SAVED_CHART_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolRunSavedChartArgsSchema,
    outputSchema: toolOutputSchema,
});

export const listWarehouseTablesToolDefinition: ToolDefinition<
    'listWarehouseTables',
    typeof toolListWarehouseTablesArgsSchema,
    typeof toolListWarehouseTablesArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'listWarehouseTables',
    title: 'List warehouse tables',
    description: TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolListWarehouseTablesArgsSchema,
    outputSchema: toolOutputSchema,
});

export const describeWarehouseTableToolDefinition: ToolDefinition<
    'describeWarehouseTable',
    typeof toolDescribeWarehouseTableArgsSchema,
    typeof toolDescribeWarehouseTableArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'describeWarehouseTable',
    title: 'Describe warehouse table',
    description: TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolDescribeWarehouseTableArgsSchema,
    outputSchema: toolOutputSchema,
});

export const listKnowledgeDocumentsToolDefinition: ToolDefinition<
    'listKnowledgeDocuments',
    typeof toolListKnowledgeDocumentsArgsSchema,
    typeof toolListKnowledgeDocumentsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'listKnowledgeDocuments',
    title: 'List knowledge documents',
    description: TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolListKnowledgeDocumentsArgsSchema,
    outputSchema: toolOutputSchema,
});

export const getKnowledgeDocumentContentToolDefinition: ToolDefinition<
    'getKnowledgeDocumentContent',
    typeof toolGetKnowledgeDocumentContentArgsSchema,
    typeof toolGetKnowledgeDocumentContentArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'getKnowledgeDocumentContent',
    title: 'Get knowledge document content',
    description: TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolGetKnowledgeDocumentContentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const readPinnedThreadToolDefinition: ToolDefinition<
    'readPinnedThread',
    typeof toolReadPinnedThreadArgsSchema,
    typeof toolReadPinnedThreadArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'readPinnedThread',
    title: 'Read pinned conversation',
    description: TOOL_READ_PINNED_THREAD_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolReadPinnedThreadArgsSchema,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findChartsToolDefinition: ToolDefinition<
    'findCharts',
    typeof toolFindChartsArgsSchema,
    typeof toolFindChartsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'findCharts',
    title: 'Find charts',
    description: TOOL_FIND_CHARTS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolFindChartsArgsSchema,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findDashboardsToolDefinition: ToolDefinition<
    'findDashboards',
    typeof toolFindDashboardsArgsSchema,
    typeof toolFindDashboardsArgsSchema,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'findDashboards',
    title: 'Find dashboards',
    description: TOOL_FIND_DASHBOARDS_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolFindDashboardsArgsSchema,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateBarVizConfigToolDefinition: ToolDefinition<
    'generateBarVizConfig',
    typeof toolVerticalBarArgsSchema,
    typeof toolVerticalBarArgsSchemaTransformed,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateBarVizConfig',
    title: 'Generate bar visualization config',
    description: TOOL_VERTICAL_BAR_VIZ_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolVerticalBarArgsSchema,
    inputSchemaTransformed: toolVerticalBarArgsSchemaTransformed,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateTableVizConfigToolDefinition: ToolDefinition<
    'generateTableVizConfig',
    typeof toolTableVizArgsSchema,
    typeof toolTableVizArgsSchemaTransformed,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateTableVizConfig',
    title: 'Generate table visualization config',
    description: TOOL_TABLE_VIZ_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolTableVizArgsSchema,
    inputSchemaTransformed: toolTableVizArgsSchemaTransformed,
    outputSchema: toolOutputSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateTimeSeriesVizConfigToolDefinition: ToolDefinition<
    'generateTimeSeriesVizConfig',
    typeof toolTimeSeriesArgsSchema,
    typeof toolTimeSeriesArgsSchemaTransformed,
    typeof toolOutputSchema,
    AgentOnlyAvailability
> = defineTool({
    name: 'generateTimeSeriesVizConfig',
    title: 'Generate time series visualization config',
    description: TOOL_TIME_SERIES_VIZ_DESCRIPTION,
    availability: { runtime: 'agent' },
    inputSchema: toolTimeSeriesArgsSchema,
    inputSchemaTransformed: toolTimeSeriesArgsSchemaTransformed,
    outputSchema: toolOutputSchema,
});

export const getLightdashVersionToolDefinition: ToolDefinition<
    'getLightdashVersion',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'get_lightdash_version'>
> = defineTool({
    name: 'getLightdashVersion',
    title: 'Get Lightdash version',
    description: 'Get the current Lightdash version',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'get_lightdash_version',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

export const listExploresToolDefinition: ToolDefinition<
    'listExplores',
    typeof mcpToolListExploresArgsSchema,
    typeof mcpToolListExploresArgsSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'list_explores'>
> = defineTool({
    name: 'listExplores',
    title: 'List explores',
    description: MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'list_explores',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: mcpToolListExploresArgsSchema,
    outputSchema: toolOutputSchema,
});

const listSkillsOutputSchema = buildToolOutputSchema(
    toolListSkillsOutputSchema,
);

export const listSkillsToolDefinition: ToolDefinition<
    'listSkills',
    typeof toolListSkillsArgsSchema,
    typeof toolListSkillsArgsSchema,
    typeof listSkillsOutputSchema,
    McpOnlyAvailability<'list_skills'>
> = defineTool({
    name: 'listSkills',
    title: 'List Skills',
    description: TOOL_LIST_SKILLS_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'list_skills',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolListSkillsArgsSchema,
    outputSchema: listSkillsOutputSchema,
});

const readSkillOutputSchema = buildToolOutputSchema(
    toolLoadSkillOutputSchemaMcp,
);

export const readSkillToolDefinition: ToolDefinition<
    'readSkill',
    typeof toolLoadSkillMcpArgsSchema,
    typeof toolLoadSkillMcpArgsSchema,
    typeof readSkillOutputSchema,
    McpOnlyAvailability<'read_skill'>
> = defineTool({
    name: 'readSkill',
    title: 'Read Skill',
    description: TOOL_LOAD_SKILL_DESCRIPTION_MCP,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'read_skill',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolLoadSkillMcpArgsSchema,
    outputSchema: readSkillOutputSchema,
});

const readSkillResourceOutputSchema = buildToolOutputSchema(
    toolLoadSkillResourceOutputSchema,
);

export const readSkillResourceToolDefinition: ToolDefinition<
    'readSkillResource',
    typeof toolLoadSkillResourceArgsSchema,
    typeof toolLoadSkillResourceArgsSchema,
    typeof readSkillResourceOutputSchema,
    McpOnlyAvailability<'read_skill_resource'>
> = defineTool({
    name: 'readSkillResource',
    title: 'Read Skill Resource',
    description: TOOL_LOAD_SKILL_RESOURCE_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'read_skill_resource',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: toolLoadSkillResourceArgsSchema,
    outputSchema: readSkillResourceOutputSchema,
});

export const mcpListProjectsToolDefinition: ToolDefinition<
    'listProjects',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'list_projects'>
> = defineTool({
    name: 'listProjects',
    title: 'List projects',
    description:
        'List all accessible projects in the organization. Projects contain explores, fields, and content. Use this to discover available projects before calling set_project to select one as the active context for subsequent operations.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'list_projects',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

export const setProjectToolDefinition: ToolDefinition<
    'setProject',
    typeof setProjectArgsSchema,
    typeof setProjectArgsSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'set_project'>
> = defineTool({
    name: 'setProject',
    title: 'Set project',
    description:
        'Set the active project for all subsequent MCP operations. Most tools (list_explores, MCP schema-discovery tools, run_metric_query, etc.) require an active project. Setting a project clears any previously selected agent, since agents are scoped to a project. After setting a project, prefer route_agent to auto-select the best agent for each request; use list_agents and set_agent only for manual override.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'set_project',
            annotations: contextWriteAnnotations,
        },
    },
    inputSchema: setProjectArgsSchema,
    outputSchema: toolOutputSchema,
});

export const getCurrentProjectToolDefinition: ToolDefinition<
    'getCurrentProject',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'get_current_project'>
> = defineTool({
    name: 'getCurrentProject',
    title: 'Get current project',
    description:
        'Get the currently active project and its configuration. Returns the project UUID, name, and any selected tags. Use this to verify context before calling data tools.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'get_current_project',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

export const listAgentsToolDefinition: ToolDefinition<
    'listAgents',
    typeof listAgentsArgsSchema,
    typeof listAgentsArgsSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'list_agents'>
> = defineTool({
    name: 'listAgents',
    title: 'List agents',
    description:
        'List accessible AI agents for the active project. Optionally filter by project UUID. Each agent is pre-configured with specific explores, tags, verified questions, and instructions that define its domain expertise. Prefer route_agent for automatic selection; use this tool when you need to inspect candidates or choose one manually before calling set_agent.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'list_agents',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: listAgentsArgsSchema,
    outputSchema: toolOutputSchema,
});

const routeAgentOutputSchema = buildToolOutputSchema(
    routeAgentStructuredOutputSchema,
);

export const routeAgentToolDefinition: ToolDefinition<
    'routeAgent',
    typeof routeAgentArgsSchema,
    typeof routeAgentArgsSchema,
    typeof routeAgentOutputSchema,
    McpOnlyAvailability<'route_agent'>
> = defineTool({
    name: 'routeAgent',
    title: 'Route agent',
    description:
        'Automatically select and activate the best AI agent for a user request within the active project. Call this at the start of each new user request after setting project context. Returns routing metadata plus the selected agent context; use set_agent only when you want to override the automatic choice manually.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'route_agent',
            annotations: writeAnnotations,
        },
    },
    inputSchema: routeAgentArgsSchema,
    outputSchema: routeAgentOutputSchema,
});

export const setAgentToolDefinition: ToolDefinition<
    'setAgent',
    typeof setAgentArgsSchema,
    typeof setAgentArgsSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'set_agent'>
> = defineTool({
    name: 'setAgent',
    title: 'Set agent',
    description:
        "Manually set the active AI agent for the active project. Prefer route_agent for default automatic selection; use this when you need to override that choice explicitly. Returns the agent's full context including: explores it has access to, space restrictions, verified questions (curated example queries that demonstrate correct usage of the data model), and custom instructions. Use this context to guide subsequent tool calls — prefer the agent's explores when calling MCP schema-discovery tools, reference verified questions as patterns for building queries with run_metric_query, and follow the agent's instructions for domain-specific conventions.",
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'set_agent',
            annotations: contextWriteAnnotations,
        },
    },
    inputSchema: setAgentArgsSchema,
    outputSchema: toolOutputSchema,
});

export const clearAgentToolDefinition: ToolDefinition<
    'clearAgent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'clear_agent'>
> = defineTool({
    name: 'clearAgent',
    title: 'Clear agent',
    description:
        "Clear the active AI agent from context. After clearing, tool calls will no longer be scoped to a specific agent's explores, tags, or instructions. The active project is preserved.",
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'clear_agent',
            annotations: contextWriteAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

export const getCurrentAgentToolDefinition: ToolDefinition<
    'getCurrentAgent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'get_current_agent'>
> = defineTool({
    name: 'getCurrentAgent',
    title: 'Get current agent',
    description:
        'Get the currently active AI agent with its full context: explores it has access to, space restrictions, verified questions (curated example queries), and custom instructions. The active agent is usually established by route_agent; use this to inspect the current automatic or manually overridden selection before making data queries.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'get_current_agent',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

export const listVerifiedContentToolDefinition: ToolDefinition<
    'listVerifiedContent',
    typeof emptyInputSchema,
    typeof emptyInputSchema,
    typeof toolOutputSchema,
    McpOnlyAvailability<'list_verified_content'>
> = defineTool({
    name: 'listVerifiedContent',
    title: 'List verified content',
    description:
        'List all verified charts and dashboards in the active project. Verified content has been reviewed and marked as trusted — use this to discover reference examples of sanctioned metrics and visualizations when building new content. Requires an active project set via set_project. Each item includes contentType (chart or dashboard), contentUuid, name, description, space, view count, last update time, and verification metadata (who verified it and when); charts also include chartKind and exploreName. To learn the full structure of a verified item (dimensions, metrics, filters), drill into it with find_content or MCP schema-discovery tools on its explore.',
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'list_verified_content',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: emptyInputSchema,
    outputSchema: toolOutputSchema,
});

const runAiWritebackOutputSchema = buildToolOutputSchema(
    mcpRunAiWritebackStructuredOutputSchema,
);

export const runAiWritebackToolDefinition: ToolDefinition<
    'runAiWriteback',
    typeof mcpRunAiWritebackArgsSchema,
    typeof mcpRunAiWritebackArgsSchema,
    typeof runAiWritebackOutputSchema,
    McpOnlyAvailability<'run_ai_writeback'>
> = defineTool({
    name: 'runAiWriteback',
    title: 'Run AI writeback',
    description: MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'run_ai_writeback',
            annotations: writeAnnotations,
        },
    },
    inputSchema: mcpRunAiWritebackArgsSchema,
    outputSchema: runAiWritebackOutputSchema,
});

const getAiWritebackStatusOutputSchema = buildToolOutputSchema(
    mcpGetAiWritebackStatusStructuredOutputSchema,
);

export const getAiWritebackStatusToolDefinition: ToolDefinition<
    'getAiWritebackStatus',
    typeof mcpGetAiWritebackStatusArgsSchema,
    typeof mcpGetAiWritebackStatusArgsSchema,
    typeof getAiWritebackStatusOutputSchema,
    McpOnlyAvailability<'get_ai_writeback_status'>
> = defineTool({
    name: 'getAiWritebackStatus',
    title: 'Get AI writeback status',
    description: MCP_TOOL_GET_AI_WRITEBACK_STATUS_DESCRIPTION,
    availability: {
        runtime: 'mcp',
        mcp: {
            name: 'get_ai_writeback_status',
            annotations: readOnlyAnnotations,
        },
    },
    inputSchema: mcpGetAiWritebackStatusArgsSchema,
    outputSchema: getAiWritebackStatusOutputSchema,
});

type AgentToolDefinitionsByName = {
    findExplores: typeof findExploresToolDefinition;
    findFields: typeof findFieldsToolDefinition;
    searchSemanticLayer: typeof searchSemanticLayerToolDefinition;
    analyzeFieldImpact: typeof analyzeFieldImpactToolDefinition;
    findContent: typeof findContentToolDefinition;
    searchFieldValues: typeof searchFieldValuesToolDefinition;
    generateVisualization: typeof generateVisualizationToolDefinition;
    runQuery: typeof runQueryToolDefinition;
    runSql: typeof runSqlToolDefinition;
    discoverFields: typeof discoverFieldsToolDefinition;
    grepFields: typeof grepFieldsToolDefinition;
    getMetadata: typeof getMetadataToolDefinition;
    generateDashboard: typeof generateDashboardToolDefinition;
    generateHashes: typeof generateHashesToolDefinition;
    generateUuids: typeof generateUuidsToolDefinition;
    getDashboardCharts: typeof getDashboardChartsToolDefinition;
    readContent: typeof readContentToolDefinition;
    editContent: typeof editContentToolDefinition;
    createContent: typeof createContentToolDefinition;
    runContentQuery: typeof runContentQueryToolDefinition;
    listContent: typeof listContentToolDefinition;
    improveContext: typeof improveContextToolDefinition;
    loadSkill: typeof loadSkillToolDefinition;
    loadProjectContext: typeof loadProjectContextToolDefinition;
    proposeChange: typeof proposeChangeToolDefinition;
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
    findCharts: typeof findChartsToolDefinition;
    findDashboards: typeof findDashboardsToolDefinition;
    generateBarVizConfig: typeof generateBarVizConfigToolDefinition;
    generateTableVizConfig: typeof generateTableVizConfigToolDefinition;
    generateTimeSeriesVizConfig: typeof generateTimeSeriesVizConfigToolDefinition;
    listProjects: typeof listProjectsToolDefinition;
    getProjectInfo: typeof getProjectInfoToolDefinition;
};

export const agentToolDefinitionsByName: AgentToolDefinitionsByName = {
    findExplores: findExploresToolDefinition,
    findFields: findFieldsToolDefinition,
    searchSemanticLayer: searchSemanticLayerToolDefinition,
    analyzeFieldImpact: analyzeFieldImpactToolDefinition,
    findContent: findContentToolDefinition,
    searchFieldValues: searchFieldValuesToolDefinition,
    generateVisualization: generateVisualizationToolDefinition,
    runQuery: runQueryToolDefinition,
    runSql: runSqlToolDefinition,
    discoverFields: discoverFieldsToolDefinition,
    grepFields: grepFieldsToolDefinition,
    getMetadata: getMetadataToolDefinition,
    generateDashboard: generateDashboardToolDefinition,
    generateHashes: generateHashesToolDefinition,
    generateUuids: generateUuidsToolDefinition,
    getDashboardCharts: getDashboardChartsToolDefinition,
    readContent: readContentToolDefinition,
    editContent: editContentToolDefinition,
    createContent: createContentToolDefinition,
    runContentQuery: runContentQueryToolDefinition,
    listContent: listContentToolDefinition,
    improveContext: improveContextToolDefinition,
    loadSkill: loadSkillToolDefinition,
    loadProjectContext: loadProjectContextToolDefinition,
    proposeChange: proposeChangeToolDefinition,
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
    findCharts: findChartsToolDefinition,
    findDashboards: findDashboardsToolDefinition,
    generateBarVizConfig: generateBarVizConfigToolDefinition,
    generateTableVizConfig: generateTableVizConfigToolDefinition,
    generateTimeSeriesVizConfig: generateTimeSeriesVizConfigToolDefinition,
    listProjects: listProjectsToolDefinition,
    getProjectInfo: getProjectInfoToolDefinition,
};

type BuiltInToolDefinitions = readonly [
    typeof findExploresToolDefinition,
    typeof findFieldsToolDefinition,
    typeof searchSemanticLayerToolDefinition,
    typeof analyzeFieldImpactToolDefinition,
    typeof findContentToolDefinition,
    typeof searchFieldValuesToolDefinition,
    typeof generateVisualizationToolDefinition,
    typeof runQueryToolDefinition,
    typeof runSqlToolDefinition,
    typeof getQueryResultToolDefinition,
    typeof renderChartToolDefinition,
    typeof discoverFieldsToolDefinition,
    typeof grepFieldsToolDefinition,
    typeof getMetadataToolDefinition,
    typeof generateDashboardToolDefinition,
    typeof generateHashesToolDefinition,
    typeof generateUuidsToolDefinition,
    typeof getDashboardChartsToolDefinition,
    typeof readContentToolDefinition,
    typeof editContentToolDefinition,
    typeof createContentToolDefinition,
    typeof runContentQueryToolDefinition,
    typeof listContentToolDefinition,
    typeof improveContextToolDefinition,
    typeof loadSkillToolDefinition,
    typeof loadProjectContextToolDefinition,
    typeof proposeChangeToolDefinition,
    typeof editDbtProjectToolDefinition,
    typeof editProjectContextToolDefinition,
    typeof editRepoToolDefinition,
    typeof syncDbtProjectToolDefinition,
    typeof exploreRepoToolDefinition,
    typeof discoverReposToolDefinition,
    typeof listWorkstreamsToolDefinition,
    typeof closePullRequestToolDefinition,
    typeof getPullRequestDiffToolDefinition,
    typeof setupPreviewDeployToolDefinition,
    typeof runSavedChartToolDefinition,
    typeof listWarehouseTablesToolDefinition,
    typeof describeWarehouseTableToolDefinition,
    typeof listKnowledgeDocumentsToolDefinition,
    typeof getKnowledgeDocumentContentToolDefinition,
    typeof readPinnedThreadToolDefinition,
    typeof findChartsToolDefinition,
    typeof findDashboardsToolDefinition,
    typeof generateBarVizConfigToolDefinition,
    typeof generateTableVizConfigToolDefinition,
    typeof generateTimeSeriesVizConfigToolDefinition,
    typeof getLightdashVersionToolDefinition,
    typeof listExploresToolDefinition,
    typeof listSkillsToolDefinition,
    typeof readSkillToolDefinition,
    typeof readSkillResourceToolDefinition,
    typeof listProjectsToolDefinition,
    typeof mcpListProjectsToolDefinition,
    typeof getProjectInfoToolDefinition,
    typeof setProjectToolDefinition,
    typeof getCurrentProjectToolDefinition,
    typeof listAgentsToolDefinition,
    typeof routeAgentToolDefinition,
    typeof setAgentToolDefinition,
    typeof clearAgentToolDefinition,
    typeof getCurrentAgentToolDefinition,
    typeof listVerifiedContentToolDefinition,
    typeof runAiWritebackToolDefinition,
];

export const builtInToolDefinitions: BuiltInToolDefinitions = [
    findExploresToolDefinition,
    findFieldsToolDefinition,
    searchSemanticLayerToolDefinition,
    analyzeFieldImpactToolDefinition,
    findContentToolDefinition,
    searchFieldValuesToolDefinition,
    generateVisualizationToolDefinition,
    runQueryToolDefinition,
    runSqlToolDefinition,
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
    editContentToolDefinition,
    createContentToolDefinition,
    runContentQueryToolDefinition,
    listContentToolDefinition,
    improveContextToolDefinition,
    loadSkillToolDefinition,
    loadProjectContextToolDefinition,
    proposeChangeToolDefinition,
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
    findChartsToolDefinition,
    findDashboardsToolDefinition,
    generateBarVizConfigToolDefinition,
    generateTableVizConfigToolDefinition,
    generateTimeSeriesVizConfigToolDefinition,
    getLightdashVersionToolDefinition,
    listExploresToolDefinition,
    listSkillsToolDefinition,
    readSkillToolDefinition,
    readSkillResourceToolDefinition,
    listProjectsToolDefinition,
    mcpListProjectsToolDefinition,
    getProjectInfoToolDefinition,
    setProjectToolDefinition,
    getCurrentProjectToolDefinition,
    listAgentsToolDefinition,
    routeAgentToolDefinition,
    setAgentToolDefinition,
    clearAgentToolDefinition,
    getCurrentAgentToolDefinition,
    listVerifiedContentToolDefinition,
    runAiWritebackToolDefinition,
];

export type BuiltInToolDefinition = (typeof builtInToolDefinitions)[number];

export type AgentToolDefinition = Extract<
    BuiltInToolDefinition,
    { availability: { runtime: 'agent' | 'both' } }
>;

const isAgentToolDefinition = (
    tool: BuiltInToolDefinition,
): tool is AgentToolDefinition =>
    tool.availability.runtime === 'agent' ||
    tool.availability.runtime === 'both';

export type McpToolDefinition = Extract<
    BuiltInToolDefinition,
    { availability: { runtime: 'mcp' | 'both' } }
>;

const isMcpToolDefinition = (
    tool: BuiltInToolDefinition,
): tool is McpToolDefinition =>
    tool.availability.runtime === 'mcp' || tool.availability.runtime === 'both';

export const agentToolDefinitions = builtInToolDefinitions.filter(
    isAgentToolDefinition,
);

export type AgentToolName = AgentToolDefinition['name'];

export const mcpToolDefinitions =
    builtInToolDefinitions.filter(isMcpToolDefinition);

export type McpToolName = ReturnType<McpToolDefinition['for']>['name'];

export const agentToolNames = agentToolDefinitions.map(
    (tool) => tool.name,
) as AgentToolName[];

export const mcpToolNames = mcpToolDefinitions.map(
    (tool) => tool.for('mcp').name,
) as McpToolName[];
