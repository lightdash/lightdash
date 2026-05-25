import { type ToolOutput } from './defineTool';
import {
    type dashboardV1Tool,
    type findChartsTool,
    type findContentTool,
    type findDashboardsTool,
    type findExploresTool,
    type findFieldsTool,
    type getKnowledgeDocumentContentTool,
    type improveContextTool,
    type proposeChangeTool,
    type runQueryTool,
    type runSqlTool,
    type searchFieldValuesTool,
} from './tools';
import {
    type ToolTableVizOutput,
    type ToolTimeSeriesOutput,
    type ToolVerticalBarOutput,
} from './viz';

export * from './customMetrics';
export * from './defineTool';
export * from './filters';
export * from './mcpSchemaCompat';
export * from './outputMetadata';
export * from './sortField';
export * from './tableCalcs/tableCalcs';
export * from './tools';
export * from './viz';
export * from './visualizations';

export type AgentToolOutput =
    | ToolOutput<typeof dashboardV1Tool>
    | ToolTableVizOutput
    | ToolTimeSeriesOutput
    | ToolVerticalBarOutput
    | ToolOutput<typeof findChartsTool>
    | ToolOutput<typeof findContentTool>
    | ToolOutput<typeof findDashboardsTool>
    | ToolOutput<typeof findExploresTool>
    | ToolOutput<typeof findFieldsTool>
    | ToolOutput<typeof getKnowledgeDocumentContentTool>
    | ToolOutput<typeof improveContextTool>
    | ToolOutput<typeof proposeChangeTool>
    | ToolOutput<typeof runQueryTool>
    | ToolOutput<typeof runSqlTool>
    | ToolOutput<typeof searchFieldValuesTool>;
