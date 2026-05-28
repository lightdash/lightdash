import { z } from 'zod';
import {
    MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    mcpRunAiWritebackArgsSchema,
    mcpRunAiWritebackStructuredOutputSchema,
} from '../../../aiWriteback/types';
import {
    defineTool,
    type McpToolAnnotations,
    type ToolDefinition,
    type ToolDefinitionInstance,
} from '../defineTool';
import {
    MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    mcpToolListExploresArgsSchema,
} from './mcpToolListExploresArgs';
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
    TOOL_EDIT_CONTENT_DESCRIPTION,
    toolEditContentArgsSchema,
} from './toolEditContentArgs';
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
    TOOL_FIND_EXPLORES_DESCRIPTION,
    toolFindExploresArgsSchemaV3,
} from './toolFindExploresArgs';
import {
    TOOL_FIND_FIELDS_DESCRIPTION,
    toolFindFieldsArgsSchema,
} from './toolFindFieldsArgs';
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
    TOOL_IMPROVE_CONTEXT_DESCRIPTION,
    toolImproveContextArgsSchema,
} from './toolImproveContextArgs';
import {
    TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    toolListKnowledgeDocumentsArgsSchema,
} from './toolListKnowledgeDocumentsArgs';
import {
    TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    toolListWarehouseTablesArgsSchema,
} from './toolListWarehouseTablesArgs';
import {
    TOOL_LOAD_SKILL_DESCRIPTION,
    toolLoadSkillArgsSchema,
} from './toolLoadSkillArgs';
import {
    TOOL_PROPOSE_CHANGE_DESCRIPTION,
    toolProposeChangeArgsSchema,
} from './toolProposeChangeArgs';
import {
    TOOL_PROPOSE_WRITEBACK_DESCRIPTION,
    toolProposeWritebackArgsSchema,
} from './toolProposeWritebackArgs';
import {
    TOOL_READ_CONTENT_DESCRIPTION,
    toolReadContentArgsSchema,
} from './toolReadContentArgs';
import {
    TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    toolRunMetricQueryArgsSchema,
} from './toolRunMetricQueryArgs';
import {
    mcpRunMetricQueryStructuredOutputSchema,
    TOOL_RUN_QUERY_DESCRIPTION,
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
    mcpRunSqlStructuredOutputSchema,
    toolRunSqlArgsSchema,
} from './toolRunSqlArgs';
import {
    TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    toolSearchFieldValuesArgsSchema,
} from './toolSearchFieldValuesArgs';
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

const emptyInputSchema = z.object({});

export const findExploresToolDefinition = defineTool({
    name: 'findExplores',
    title: 'Find explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolFindExploresArgsSchemaV3,
    mcp: { name: 'find_explores', annotations: readOnlyAnnotations },
});

export const findFieldsToolDefinition = defineTool({
    name: 'findFields',
    title: 'Find fields',
    description: TOOL_FIND_FIELDS_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolFindFieldsArgsSchema,
    mcp: { name: 'find_fields', annotations: readOnlyAnnotations },
});

export const findContentToolDefinition = defineTool({
    name: 'findContent',
    title: 'Find content',
    description: TOOL_FIND_CONTENT_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolFindContentArgsSchema,
    mcp: { name: 'find_content', annotations: readOnlyAnnotations },
});

export const searchFieldValuesToolDefinition = defineTool({
    name: 'searchFieldValues',
    title: 'Search field values',
    description: TOOL_SEARCH_FIELD_VALUES_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolSearchFieldValuesArgsSchema,
    mcp: { name: 'search_field_values', annotations: readOnlyAnnotations },
});

export const runQueryToolDefinition = defineTool({
    name: 'runQuery',
    title: 'Run query',
    description: TOOL_RUN_QUERY_DESCRIPTION,
    availability: ['agent', 'mcp'],
    inputSchema: toolRunQueryArgsSchema,
    inputSchemaTransformed: toolRunQueryArgsSchemaTransformed,
    mcp: {
        name: 'run_metric_query',
        annotations: readOnlyAnnotations,
        outputSchema: mcpRunMetricQueryStructuredOutputSchema,
    },
});

export const runSqlToolDefinition = defineTool({
    name: 'runSql',
    title: 'Run SQL',
    description: buildRunSqlDescription(
        DEFAULT_RUN_SQL_LIMIT,
        DEFAULT_RUN_SQL_MAX_LIMIT,
    ),
    availability: ['agent', 'mcp'],
    inputSchema: toolRunSqlArgsSchema,
    mcp: {
        name: 'run_sql',
        annotations: readOnlyAnnotations,
        outputSchema: mcpRunSqlStructuredOutputSchema,
    },
});

/** @deprecated Legacy CSV-only metric query tool. */
export const runMetricQueryToolDefinition = defineTool({
    name: 'runMetricQuery',
    title: 'Run metric query',
    description: TOOL_RUN_METRIC_QUERY_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunMetricQueryArgsSchema,
});

export const discoverFieldsToolDefinition = defineTool({
    name: 'discoverFields',
    title: 'Discover fields',
    description: DISCOVER_FIELDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: discoverFieldsInputSchema,
});

export const generateDashboardToolDefinition = defineTool({
    name: 'generateDashboard',
    title: 'Generate dashboard',
    description: TOOL_DASHBOARD_V2_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDashboardV2ArgsSchema,
});

/** @deprecated Legacy v1 dashboard tool schema kept for historical tool calls and artifacts. */
export const generateDashboardV1ToolDefinition: ToolDefinition<
    'generateDashboard',
    typeof toolDashboardArgsSchema
> = defineTool({
    name: 'generateDashboard',
    title: 'Generate dashboard',
    description: TOOL_DASHBOARD_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDashboardArgsSchema,
});

export const generateUuidsToolDefinition = defineTool({
    name: 'generateUuids',
    title: 'Generate UUIDs',
    description: TOOL_GENERATE_UUIDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGenerateUuidsArgsSchema,
});

export const getDashboardChartsToolDefinition = defineTool({
    name: 'getDashboardCharts',
    title: 'Get dashboard charts',
    description: TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetDashboardChartsArgsSchema,
});

export const readContentToolDefinition = defineTool({
    name: 'readContent',
    title: 'Read content',
    description: TOOL_READ_CONTENT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolReadContentArgsSchema,
});

export const editContentToolDefinition = defineTool({
    name: 'editContent',
    title: 'Edit content',
    description: TOOL_EDIT_CONTENT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolEditContentArgsSchema,
});

export const improveContextToolDefinition = defineTool({
    name: 'improveContext',
    title: 'Improve context',
    description: TOOL_IMPROVE_CONTEXT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolImproveContextArgsSchema,
});

export const loadSkillToolDefinition = defineTool({
    name: 'loadSkill',
    title: 'Load skill',
    description: TOOL_LOAD_SKILL_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolLoadSkillArgsSchema,
});

export const proposeChangeToolDefinition = defineTool({
    name: 'proposeChange',
    title: 'Propose change',
    description: TOOL_PROPOSE_CHANGE_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolProposeChangeArgsSchema,
});

export const proposeWritebackToolDefinition = defineTool({
    name: 'proposeWriteback',
    title: 'Propose writeback',
    description: TOOL_PROPOSE_WRITEBACK_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolProposeWritebackArgsSchema,
});

export const runSavedChartToolDefinition = defineTool({
    name: 'runSavedChart',
    title: 'Run saved chart',
    description: TOOL_RUN_SAVED_CHART_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolRunSavedChartArgsSchema,
});

export const listWarehouseTablesToolDefinition = defineTool({
    name: 'listWarehouseTables',
    title: 'List warehouse tables',
    description: TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListWarehouseTablesArgsSchema,
});

export const describeWarehouseTableToolDefinition = defineTool({
    name: 'describeWarehouseTable',
    title: 'Describe warehouse table',
    description: TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolDescribeWarehouseTableArgsSchema,
});

export const listKnowledgeDocumentsToolDefinition = defineTool({
    name: 'listKnowledgeDocuments',
    title: 'List knowledge documents',
    description: TOOL_LIST_KNOWLEDGE_DOCUMENTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolListKnowledgeDocumentsArgsSchema,
});

export const getKnowledgeDocumentContentToolDefinition = defineTool({
    name: 'getKnowledgeDocumentContent',
    title: 'Get knowledge document content',
    description: TOOL_GET_KNOWLEDGE_DOCUMENT_CONTENT_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolGetKnowledgeDocumentContentArgsSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findChartsToolDefinition = defineTool({
    name: 'findCharts',
    title: 'Find charts',
    description: TOOL_FIND_CHARTS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindChartsArgsSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const findDashboardsToolDefinition = defineTool({
    name: 'findDashboards',
    title: 'Find dashboards',
    description: TOOL_FIND_DASHBOARDS_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolFindDashboardsArgsSchema,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateBarVizConfigToolDefinition = defineTool({
    name: 'generateBarVizConfig',
    title: 'Generate bar visualization config',
    description: TOOL_VERTICAL_BAR_VIZ_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolVerticalBarArgsSchema,
    inputSchemaTransformed: toolVerticalBarArgsSchemaTransformed,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateTableVizConfigToolDefinition = defineTool({
    name: 'generateTableVizConfig',
    title: 'Generate table visualization config',
    description: TOOL_TABLE_VIZ_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolTableVizArgsSchema,
    inputSchemaTransformed: toolTableVizArgsSchemaTransformed,
});

/** @deprecated Legacy agent tool kept for historical tool calls. */
export const generateTimeSeriesVizConfigToolDefinition = defineTool({
    name: 'generateTimeSeriesVizConfig',
    title: 'Generate time series visualization config',
    description: TOOL_TIME_SERIES_VIZ_DESCRIPTION,
    availability: ['agent'],
    inputSchema: toolTimeSeriesArgsSchema,
    inputSchemaTransformed: toolTimeSeriesArgsSchemaTransformed,
});

export const getLightdashVersionToolDefinition = defineTool({
    name: 'getLightdashVersion',
    title: 'Get Lightdash version',
    description: 'Get the current Lightdash version',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'get_lightdash_version', annotations: readOnlyAnnotations },
});

export const listExploresToolDefinition = defineTool({
    name: 'listExplores',
    title: 'List explores',
    description: MCP_TOOL_LIST_EXPLORES_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: mcpToolListExploresArgsSchema,
    mcp: { name: 'list_explores', annotations: readOnlyAnnotations },
});

export const listProjectsToolDefinition = defineTool({
    name: 'listProjects',
    title: 'List projects',
    description:
        'List all accessible projects in the organization. Projects contain explores, fields, and content. Use this to discover available projects before calling set_project to select one as the active context for subsequent operations.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'list_projects', annotations: readOnlyAnnotations },
});

export const setProjectToolDefinition = defineTool({
    name: 'setProject',
    title: 'Set project',
    description:
        'Set the active project for all subsequent MCP operations. Most tools (list_explores, find_fields, run_metric_query, etc.) require an active project. Setting a project clears any previously selected agent, since agents are scoped to a project. After setting a project, use list_agents to discover available AI agents and optionally set_agent to activate one.',
    availability: ['mcp'],
    inputSchema: z.object({
        projectUuid: z.string(),
        tags: z.array(z.string()).optional(),
    }),
    mcp: { name: 'set_project', annotations: readOnlyAnnotations },
});

export const getCurrentProjectToolDefinition = defineTool({
    name: 'getCurrentProject',
    title: 'Get current project',
    description:
        'Get the currently active project and its configuration. Returns the project UUID, name, and any selected tags. Use this to verify context before calling data tools.',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'get_current_project', annotations: readOnlyAnnotations },
});

export const listAgentsToolDefinition = defineTool({
    name: 'listAgents',
    title: 'List agents',
    description:
        'List accessible AI agents for the active project. Optionally filter by project UUID. Each agent is pre-configured with specific explores, tags, verified questions, and instructions that define its domain expertise. Use this to discover which agents are available before calling set_agent.',
    availability: ['mcp'],
    inputSchema: z.object({
        projectUuid: z.string().optional(),
    }),
    mcp: { name: 'list_agents', annotations: readOnlyAnnotations },
});

export const setAgentToolDefinition = defineTool({
    name: 'setAgent',
    title: 'Set agent',
    description:
        "Set the active AI agent for the active project. Returns the agent's full context including: explores it has access to, verified questions (curated example queries that demonstrate correct usage of the data model), and custom instructions. Use this context to guide subsequent tool calls — prefer the agent's explores when calling find_explores/find_fields, reference verified questions as patterns for building queries with run_metric_query, and follow the agent's instructions for domain-specific conventions.",
    availability: ['mcp'],
    inputSchema: z.object({
        agentUuid: z.string(),
    }),
    mcp: { name: 'set_agent', annotations: readOnlyAnnotations },
});

export const clearAgentToolDefinition = defineTool({
    name: 'clearAgent',
    title: 'Clear agent',
    description:
        "Clear the active AI agent from context. After clearing, tool calls will no longer be scoped to a specific agent's explores, tags, or instructions. The active project is preserved.",
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'clear_agent', annotations: readOnlyAnnotations },
});

export const getCurrentAgentToolDefinition = defineTool({
    name: 'getCurrentAgent',
    title: 'Get current agent',
    description:
        "Get the currently active AI agent with its full context: explores it has access to, verified questions (curated example queries), and custom instructions. Use this to retrieve the agent's domain knowledge before making data queries.",
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'get_current_agent', annotations: readOnlyAnnotations },
});

export const listVerifiedContentToolDefinition = defineTool({
    name: 'listVerifiedContent',
    title: 'List verified content',
    description:
        'List all verified charts and dashboards in the active project. Verified content has been reviewed and marked as trusted — use this to discover reference examples of sanctioned metrics and visualizations when building new content. Requires an active project set via set_project. Each item includes contentType (chart or dashboard), contentUuid, name, space, and verification metadata (who verified it and when).',
    availability: ['mcp'],
    inputSchema: emptyInputSchema,
    mcp: { name: 'list_verified_content', annotations: readOnlyAnnotations },
});

export const runAiWritebackToolDefinition = defineTool({
    name: 'runAiWriteback',
    title: 'Run AI writeback',
    description: MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION,
    availability: ['mcp'],
    inputSchema: mcpRunAiWritebackArgsSchema,
    mcp: {
        name: 'run_ai_writeback',
        annotations: writeAnnotations,
        outputSchema: mcpRunAiWritebackStructuredOutputSchema,
    },
});

export const builtInToolDefinitions: readonly ToolDefinitionInstance[] = [
    findExploresToolDefinition,
    findFieldsToolDefinition,
    findContentToolDefinition,
    searchFieldValuesToolDefinition,
    runQueryToolDefinition,
    runSqlToolDefinition,
    discoverFieldsToolDefinition,
    generateDashboardToolDefinition,
    generateUuidsToolDefinition,
    getDashboardChartsToolDefinition,
    readContentToolDefinition,
    editContentToolDefinition,
    improveContextToolDefinition,
    loadSkillToolDefinition,
    proposeChangeToolDefinition,
    proposeWritebackToolDefinition,
    runSavedChartToolDefinition,
    listWarehouseTablesToolDefinition,
    describeWarehouseTableToolDefinition,
    listKnowledgeDocumentsToolDefinition,
    getKnowledgeDocumentContentToolDefinition,
    findChartsToolDefinition,
    findDashboardsToolDefinition,
    generateBarVizConfigToolDefinition,
    generateTableVizConfigToolDefinition,
    generateTimeSeriesVizConfigToolDefinition,
    getLightdashVersionToolDefinition,
    listExploresToolDefinition,
    listProjectsToolDefinition,
    setProjectToolDefinition,
    getCurrentProjectToolDefinition,
    listAgentsToolDefinition,
    setAgentToolDefinition,
    clearAgentToolDefinition,
    getCurrentAgentToolDefinition,
    listVerifiedContentToolDefinition,
    runAiWritebackToolDefinition,
] as const;

export type BuiltInToolDefinition = ToolDefinitionInstance;

export const agentToolDefinitions = builtInToolDefinitions.filter((tool) =>
    tool.availability.includes('agent'),
);

export type AgentToolDefinition = (typeof agentToolDefinitions)[number];

export const mcpToolDefinitions = builtInToolDefinitions.filter((tool) =>
    tool.availability.includes('mcp'),
);

export type McpToolDefinition = (typeof mcpToolDefinitions)[number];

export const agentToolNames = agentToolDefinitions.map((tool) => tool.name) as [
    string,
    ...string[],
];

export const mcpToolNames = mcpToolDefinitions.map(
    (tool) => tool.for('mcp').name,
) as [string, ...string[]];

export const agentToolDefinitionsByName = Object.fromEntries(
    agentToolDefinitions.map((tool) => [tool.name, tool]),
) as Record<string, AgentToolDefinition>;

export const mcpToolDefinitionsByName = Object.fromEntries(
    mcpToolDefinitions.map((tool) => [tool.for('mcp').name, tool]),
) as Record<string, McpToolDefinition>;
