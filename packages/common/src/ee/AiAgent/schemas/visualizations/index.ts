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
    'generateUuids',
    'findContent',
    'findExplores',
    'findFields',
    'discoverFields',
    'searchFieldValues',
    'findDashboards',
    'findCharts',
    'getDashboardCharts',
    'readContent',
    'editContent',
    'createContent',
    'improveContext',
    'loadSkill',
    'proposeChange',
    'proposeWriteback',
    'runQuery',
    'runSavedChart',
    'runSavedChartV2',
    'runSql',
    'listWarehouseTables',
    'describeWarehouseTable',
    'listKnowledgeDocuments',
    'getKnowledgeDocumentContent',
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
    discoverFields: 'Discovering fields',
    searchFieldValues: 'Searching field values',
    generateBarVizConfig: 'Generating a bar chart',
    generateTableVizConfig: 'Generating a table',
    generateTimeSeriesVizConfig: 'Generating a line chart',
    generateDashboard: 'Generating a dashboard',
    generateUuids: 'Generating UUIDs',
    findCharts: 'Finding relevant charts',
    getDashboardCharts: 'Looking up dashboard charts',
    readContent: 'Reading content',
    editContent: 'Editing content',
    createContent: 'Creating content',
    improveContext: 'Improving context',
    loadSkill: 'Loading built-in skill',
    proposeWriteback: 'Opening a pull request',
    runQuery: 'Generating visualization',
    runSavedChart: 'Running saved chart',
    runSavedChartV2: 'Running saved chart',
    runSql: 'Running SQL query',
    listWarehouseTables: 'Listing warehouse tables',
    describeWarehouseTable: 'Describing warehouse table',
    listKnowledgeDocuments: 'Listing knowledge documents',
    getKnowledgeDocumentContent: 'Reading knowledge document',
});

// after-tool-call messages
export const TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL =
    ToolDisplayMessagesSchema.parse({
        findExplores: 'Found relevant explores',
        findDashboards: 'Found relevant dashboards',
        findFields: 'Found relevant fields',
        discoverFields: 'Discovered fields',
        findContent: 'Found relevant content',
        searchFieldValues: 'Found field values',
        generateBarVizConfig: 'Generated a bar chart',
        generateTableVizConfig: 'Generated a table',
        generateTimeSeriesVizConfig: 'Generated a line chart',
        generateDashboard: 'Generated a dashboard',
        generateUuids: 'Generated UUIDs',
        findCharts: 'Found relevant charts',
        getDashboardCharts: 'Found dashboard charts',
        readContent: 'Read content',
        editContent: 'Edited content',
        createContent: 'Created content',
        improveContext: 'Improved context',
        loadSkill: 'Loaded built-in skill',
        proposeWriteback: 'Opened pull request',
        runQuery: 'Generated visualization',
        runSavedChart: 'Ran saved chart',
        runSavedChartV2: 'Ran saved chart',
        runSql: 'Ran SQL query',
        listWarehouseTables: 'Listed warehouse tables',
        describeWarehouseTable: 'Described warehouse table',
        listKnowledgeDocuments: 'Listed knowledge documents',
        getKnowledgeDocumentContent: 'Read knowledge document',
    });

export const AVAILABLE_VISUALIZATION_TYPES = VisualizationTools;
