import { z } from 'zod';

export * from './tableViz';
export * from './timeSeriesViz';
export * from './verticalBarViz';

const VisualizationTools = [
    'generateBarVizConfig',
    'generateTableVizConfig',
    'generateTimeSeriesVizConfig',
] as const;

// define tool names
export const ToolNameSchema = z.enum([
    ...VisualizationTools,
    'generateDashboard',
    'findContent',
    'findExplores',
    'findFields',
    'searchFieldValues',
    'findDashboards',
    'findCharts',
    'improveContext',
    'proposeChange',
    'runQuery',
]);

export type ToolName = z.infer<typeof ToolNameSchema>;

export const isToolName = (toolName: string): toolName is ToolName =>
    ToolNameSchema.safeParse(toolName).success;

// display messages schema
export const ToolDisplayMessagesSchema = z.record(ToolNameSchema, z.string());

export const TOOL_DISPLAY_MESSAGES = ToolDisplayMessagesSchema.parse({
    findExplores: 'Finding relevant explores',
    findDashboards: 'Finding relevant dashboards',
    findContent: 'Finding relevant content',
    findFields: 'Finding relevant fields',
    searchFieldValues: 'Searching field values',
    generateBarVizConfig: 'Generating a bar chart',
    generateTableVizConfig: 'Generating a table',
    generateTimeSeriesVizConfig: 'Generating a line chart',
    generateDashboard: 'Generating a dashboard',
    findCharts: 'Finding relevant charts',
    improveContext: 'Improving context',
    runQuery: 'Generating visualization',
});

// after-tool-call messages
export const TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL =
    ToolDisplayMessagesSchema.parse({
        findExplores: 'Found relevant explores',
        findDashboards: 'Found relevant dashboards',
        findFields: 'Found relevant fields',
        findContent: 'Found relevant content',
        searchFieldValues: 'Found field values',
        generateBarVizConfig: 'Generated a bar chart',
        generateTableVizConfig: 'Generated a table',
        generateTimeSeriesVizConfig: 'Generated a line chart',
        generateDashboard: 'Generated a dashboard',
        findCharts: 'Found relevant charts',
        improveContext: 'Improved context',
        runQuery: 'Generated visualization',
    });

export const AVAILABLE_VISUALIZATION_TYPES = VisualizationTools;
