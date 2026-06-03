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
    'generateHashes',
    'generateUuids',
    'findContent',
    'listContent',
    'findExplores',
    'findFields',
    'searchSemanticLayer',
    'discoverFields',
    'searchFieldValues',
    'findDashboards',
    'findCharts',
    'getDashboardCharts',
    'readContent',
    'editContent',
    'createContent',
    'runContentQuery',
    'improveContext',
    'listProjects',
    'getProjectInfo',
    'loadSkill',
    'loadProjectContext',
    'proposeChange',
    'proposeWriteback',
    'generateVisualization',
    'setupPreviewDeploy',
    'runQuery',
    'runSavedChart',
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
    listContent: 'Listing content',
    findFields: 'Finding relevant fields',
    searchSemanticLayer: 'Searching the semantic layer',
    discoverFields: 'Discovering fields',
    searchFieldValues: 'Searching field values',
    generateBarVizConfig: 'Generating a bar chart',
    generateTableVizConfig: 'Generating a table',
    generateTimeSeriesVizConfig: 'Generating a line chart',
    generateDashboard: 'Generating a dashboard',
    generateHashes: 'Generating hashes',
    generateUuids: 'Generating UUIDs',
    findCharts: 'Finding relevant charts',
    getDashboardCharts: 'Looking up dashboard charts',
    readContent: 'Reading content',
    editContent: 'Editing content',
    createContent: 'Creating content',
    runContentQuery: 'Running content query',
    improveContext: 'Improving context',
    listProjects: 'Listing projects',
    getProjectInfo: 'Getting project details',
    loadSkill: 'Loading built-in skill',
    loadProjectContext: 'Loading project context',
    proposeWriteback: 'Opening a pull request',
    generateVisualization: 'Generating visualization',
    setupPreviewDeploy: 'Setting up preview deploys',
    runQuery: 'Generating visualization',
    runSavedChart: 'Running saved chart',
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
        searchSemanticLayer: 'Searched the semantic layer',
        discoverFields: 'Discovered fields',
        findContent: 'Found relevant content',
        listContent: 'Listed content',
        searchFieldValues: 'Found field values',
        generateBarVizConfig: 'Generated a bar chart',
        generateTableVizConfig: 'Generated a table',
        generateTimeSeriesVizConfig: 'Generated a line chart',
        generateDashboard: 'Generated a dashboard',
        generateHashes: 'Generated hashes',
        generateUuids: 'Generated UUIDs',
        findCharts: 'Found relevant charts',
        getDashboardCharts: 'Found dashboard charts',
        readContent: 'Read content',
        editContent: 'Edited content',
        createContent: 'Created content',
        runContentQuery: 'Ran content query',
        improveContext: 'Improved context',
        listProjects: 'Listed projects',
        getProjectInfo: 'Got project details',
        loadSkill: 'Loaded built-in skill',
        loadProjectContext: 'Loaded project context',
        proposeWriteback: 'Opened pull request',
        generateVisualization: 'Generated visualization',
        setupPreviewDeploy: 'Opened preview-deploy pull request',
        runQuery: 'Generated visualization',
        runSavedChart: 'Ran saved chart',
        runSql: 'Ran SQL query',
        listWarehouseTables: 'Listed warehouse tables',
        describeWarehouseTable: 'Described warehouse table',
        listKnowledgeDocuments: 'Listed knowledge documents',
        getKnowledgeDocumentContent: 'Read knowledge document',
    });

export const AVAILABLE_VISUALIZATION_TYPES = VisualizationTools;
