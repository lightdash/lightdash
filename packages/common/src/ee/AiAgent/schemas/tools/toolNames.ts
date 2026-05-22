import { z } from 'zod';
import { listExploresTool } from './mcpToolListExploresArgs';
import {
    toolDashboardV2ArgsSchema,
    toolDashboardV2ArgsSchemaTransformed,
    toolDashboardV2OutputSchema,
} from './toolDashboardV2Args';
import {
    type BoundToolRegistry,
    defineTool,
    ToolRegistry,
    type ToolContext,
} from './toolDefinition';
import { describeWarehouseTableTool } from './toolDescribeWarehouseTableArgs';
import { discoverFieldsTool } from './toolDiscoverFieldsArgs';
import { editContentTool } from './toolEditContentArgs';
import { findChartsTool } from './toolFindChartsArgs';
import { findContentTool } from './toolFindContentArgs';
import { findDashboardsTool } from './toolFindDashboardsArgs';
import { findExploresTool } from './toolFindExploresArgs';
import { findFieldsTool } from './toolFindFieldsArgs';
import { getDashboardChartsTool } from './toolGetDashboardChartsArgs';
import { getKnowledgeDocumentContentTool } from './toolGetKnowledgeDocumentContentArgs';
import { improveContextTool } from './toolImproveContextArgs';
import { listKnowledgeDocumentsTool } from './toolListKnowledgeDocumentsArgs';
import { listWarehouseTablesTool } from './toolListWarehouseTablesArgs';
import { loadSkillTool } from './toolLoadSkillArgs';
import {
    toolProposeChangeArgsSchema,
    toolProposeChangeOutputSchema,
} from './toolProposeChangeArgs';
import { readContentTool } from './toolReadContentArgs';
import { runMetricQueryTool } from './toolRunMetricQueryArgs';
import { runQueryTool } from './toolRunQueryArgs';
import { runSavedChartTool } from './toolRunSavedChartArgs';
import { runSqlTool } from './toolRunSqlArgs';
import { searchFieldValuesTool } from './toolSearchFieldValuesArgs';
import { generateTableVizConfigTool } from './toolTableVizArgs';
import { generateTimeSeriesVizConfigTool } from './toolTimeSeriesArgs';
import { generateBarVizConfigTool } from './toolVerticalBarArgs';

const toolTextOutputSchema = z.object({
    result: z.string(),
});

const getLightdashVersionTool = defineTool({
    canonicalName: 'getLightdashVersion',
    title: 'Get Lightdash Version',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () => z.object({}).describe('Get the current Lightdash version'),
    },
    outputSchema: toolTextOutputSchema,
});

const listProjectsTool = defineTool({
    canonicalName: 'listProjects',
    title: 'List Projects',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({})
                .describe(
                    'List all accessible projects in the organization. Projects contain explores, fields, and content. Use this to discover available projects before calling set_project to select one as the active context for subsequent operations.',
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const setProjectTool = defineTool({
    canonicalName: 'setProject',
    title: 'Set Project',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({
                    projectUuid: z.string(),
                    tags: z.array(z.string()).optional(),
                })
                .describe(
                    'Set the active project for all subsequent MCP operations. Most tools (list_explores, find_fields, run_metric_query, etc.) require an active project. Setting a project clears any previously selected agent, since agents are scoped to a project. After setting a project, use list_agents to discover available AI agents and optionally set_agent to activate one.',
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const getCurrentProjectTool = defineTool({
    canonicalName: 'getCurrentProject',
    title: 'Get Current Project',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({})
                .describe(
                    'Get the currently active project and its configuration. Returns the project UUID, name, and any selected tags. Use this to verify context before calling data tools.',
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const listAgentsTool = defineTool({
    canonicalName: 'listAgents',
    title: 'List Agents',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({
                    projectUuid: z.string().optional(),
                })
                .describe(
                    'List all accessible AI agents. Optionally filter by project UUID. Each agent is pre-configured with specific explores, tags, verified questions, and instructions that define its domain expertise. Use this to discover which agents are available before calling set_agent.',
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const setAgentTool = defineTool({
    canonicalName: 'setAgent',
    title: 'Set Agent',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({
                    agentUuid: z.string(),
                })
                .describe(
                    "Set the active AI agent. Returns the agent's full context including: explores it has access to, verified questions (curated example queries that demonstrate correct usage of the data model), and custom instructions. Use this context to guide subsequent tool calls — prefer the agent's explores when calling find_explores/find_fields, reference verified questions as patterns for building queries with run_metric_query, and follow the agent's instructions for domain-specific conventions.",
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const clearAgentTool = defineTool({
    canonicalName: 'clearAgent',
    title: 'Clear Agent',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({})
                .describe(
                    "Clear the active AI agent from context. After clearing, tool calls will no longer be scoped to a specific agent's explores, tags, or instructions. The active project is preserved.",
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const getCurrentAgentTool = defineTool({
    canonicalName: 'getCurrentAgent',
    title: 'Get Current Agent',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({})
                .describe(
                    "Get the currently active AI agent with its full context: explores it has access to, verified questions (curated example queries), and custom instructions. Use this to retrieve the agent's domain knowledge before making data queries.",
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const listVerifiedContentTool = defineTool({
    canonicalName: 'listVerifiedContent',
    title: 'List Verified Content',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () =>
            z
                .object({})
                .describe(
                    'List all verified charts and dashboards in the active project. Verified content has been reviewed and marked as trusted — use this to discover reference examples of sanctioned metrics and visualizations when building new content. Requires an active project set via set_project. Each item includes contentType (chart or dashboard), contentUuid, name, space, and verification metadata (who verified it and when).',
                ),
    },
    outputSchema: toolTextOutputSchema,
});

const generateDashboardTool = defineTool({
    canonicalName: 'generateDashboard',
    title: 'Generate Dashboard',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolDashboardV2ArgsSchema,
    },
    outputSchema: toolDashboardV2OutputSchema,
    parseInput: {
        agent: (raw) => toolDashboardV2ArgsSchemaTransformed.parse(raw),
    },
});

const proposeChangeTool = defineTool({
    canonicalName: 'proposeChange',
    title: 'Propose Change',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolProposeChangeArgsSchema,
    },
    outputSchema: toolProposeChangeOutputSchema,
});

type ToolDefinitionsMap = {
    clearAgent: typeof clearAgentTool;
    describeWarehouseTable: typeof describeWarehouseTableTool;
    discoverFields: typeof discoverFieldsTool;
    editContent: typeof editContentTool;
    findCharts: typeof findChartsTool;
    findContent: typeof findContentTool;
    findDashboards: typeof findDashboardsTool;
    findExplores: typeof findExploresTool;
    findFields: typeof findFieldsTool;
    generateBarVizConfig: typeof generateBarVizConfigTool;
    generateDashboard: typeof generateDashboardTool;
    generateTableVizConfig: typeof generateTableVizConfigTool;
    generateTimeSeriesVizConfig: typeof generateTimeSeriesVizConfigTool;
    getCurrentAgent: typeof getCurrentAgentTool;
    getCurrentProject: typeof getCurrentProjectTool;
    getDashboardCharts: typeof getDashboardChartsTool;
    getKnowledgeDocumentContent: typeof getKnowledgeDocumentContentTool;
    getLightdashVersion: typeof getLightdashVersionTool;
    improveContext: typeof improveContextTool;
    listAgents: typeof listAgentsTool;
    listExplores: typeof listExploresTool;
    listKnowledgeDocuments: typeof listKnowledgeDocumentsTool;
    listProjects: typeof listProjectsTool;
    listVerifiedContent: typeof listVerifiedContentTool;
    listWarehouseTables: typeof listWarehouseTablesTool;
    loadSkill: typeof loadSkillTool;
    proposeChange: typeof proposeChangeTool;
    readContent: typeof readContentTool;
    runMetricQuery: typeof runMetricQueryTool;
    runQuery: typeof runQueryTool;
    runSavedChart: typeof runSavedChartTool;
    runSql: typeof runSqlTool;
    searchFieldValues: typeof searchFieldValuesTool;
    setAgent: typeof setAgentTool;
    setProject: typeof setProjectTool;
};

const toolDefinitions: ToolDefinitionsMap = {
    clearAgent: clearAgentTool,
    describeWarehouseTable: describeWarehouseTableTool,
    discoverFields: discoverFieldsTool,
    editContent: editContentTool,
    findCharts: findChartsTool,
    findContent: findContentTool,
    findDashboards: findDashboardsTool,
    findExplores: findExploresTool,
    findFields: findFieldsTool,
    generateBarVizConfig: generateBarVizConfigTool,
    generateDashboard: generateDashboardTool,
    generateTableVizConfig: generateTableVizConfigTool,
    generateTimeSeriesVizConfig: generateTimeSeriesVizConfigTool,
    getCurrentAgent: getCurrentAgentTool,
    getCurrentProject: getCurrentProjectTool,
    getDashboardCharts: getDashboardChartsTool,
    getKnowledgeDocumentContent: getKnowledgeDocumentContentTool,
    getLightdashVersion: getLightdashVersionTool,
    improveContext: improveContextTool,
    listAgents: listAgentsTool,
    listExplores: listExploresTool,
    listKnowledgeDocuments: listKnowledgeDocumentsTool,
    listProjects: listProjectsTool,
    listVerifiedContent: listVerifiedContentTool,
    listWarehouseTables: listWarehouseTablesTool,
    loadSkill: loadSkillTool,
    proposeChange: proposeChangeTool,
    readContent: readContentTool,
    runMetricQuery: runMetricQueryTool,
    runQuery: runQueryTool,
    runSavedChart: runSavedChartTool,
    runSql: runSqlTool,
    searchFieldValues: searchFieldValuesTool,
    setAgent: setAgentTool,
    setProject: setProjectTool,
};

export const ToolDefinitions: ToolRegistry<typeof toolDefinitions> =
    new ToolRegistry(toolDefinitions);

const agentTools: BoundToolRegistry<typeof toolDefinitions, 'agent'> =
    ToolDefinitions.for('agent');
const mcpTools: BoundToolRegistry<typeof toolDefinitions, 'mcp'> =
    ToolDefinitions.for('mcp');

export type ToolName = (typeof agentTools)[keyof typeof agentTools]['name'];
export type McpToolName = (typeof mcpTools)[keyof typeof mcpTools]['name'];

export const AgentToolNames = [
    agentTools.generateBarVizConfig.name,
    agentTools.generateTableVizConfig.name,
    agentTools.generateTimeSeriesVizConfig.name,
    agentTools.generateDashboard.name,
    agentTools.findContent.name,
    agentTools.findExplores.name,
    agentTools.findFields.name,
    agentTools.discoverFields.name,
    agentTools.searchFieldValues.name,
    agentTools.findDashboards.name,
    agentTools.findCharts.name,
    agentTools.getDashboardCharts.name,
    agentTools.readContent.name,
    agentTools.editContent.name,
    agentTools.improveContext.name,
    agentTools.loadSkill.name,
    agentTools.proposeChange.name,
    agentTools.runQuery.name,
    agentTools.runSavedChart.name,
    agentTools.runSql.name,
    agentTools.listWarehouseTables.name,
    agentTools.describeWarehouseTable.name,
    agentTools.listKnowledgeDocuments.name,
    agentTools.getKnowledgeDocumentContent.name,
] as const satisfies readonly ToolName[];

export const McpToolNames = [
    mcpTools.getLightdashVersion.name,
    mcpTools.listExplores.name,
    mcpTools.findExplores.name,
    mcpTools.findFields.name,
    mcpTools.findContent.name,
    mcpTools.listProjects.name,
    mcpTools.setProject.name,
    mcpTools.getCurrentProject.name,
    mcpTools.listAgents.name,
    mcpTools.setAgent.name,
    mcpTools.clearAgent.name,
    mcpTools.getCurrentAgent.name,
    mcpTools.runMetricQuery.name,
    mcpTools.searchFieldValues.name,
    mcpTools.runSql.name,
    mcpTools.listVerifiedContent.name,
] as const satisfies readonly McpToolName[];

export const ToolNameSchema = z.enum(AgentToolNames);

export const isToolName = (toolName: string): toolName is ToolName =>
    ToolNameSchema.safeParse(toolName).success;

export type BoundToolDefinitions<TContext extends ToolContext> = ReturnType<
    typeof ToolDefinitions.for<TContext>
>;
