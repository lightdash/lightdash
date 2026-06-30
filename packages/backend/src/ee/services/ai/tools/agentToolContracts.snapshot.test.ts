import { agentToolDefinitions } from '@lightdash/common';
import { asSchema, type FlexibleSchema } from 'ai';
import { getDiscoverFields } from '../agents/discoverFields/tool';
import { getCreateContent } from './createContent';
import { getDescribeWarehouseTable } from './describeWarehouseTable';
import { getDiscoverRepos } from './discoverRepos';
import { getEditContent } from './editContent';
import { getEditDbtProject } from './editDbtProject';
import { getEditProjectContext } from './editProjectContext';
import { getExploreRepo } from './exploreRepo';
import { getFindContent } from './findContent';
import { getFindExplores } from './findExplores';
import { getFindFields } from './findFields';
import { getGenerateDashboardV2 } from './generateDashboardV2';
import { getGenerateHashes } from './generateHashes';
import { getGenerateUuids } from './generateUuids';
import { getGenerateVisualization } from './generateVisualization';
import { getGetDashboardCharts } from './getDashboardCharts';
import { getGetKnowledgeDocumentContent } from './getKnowledgeDocumentContent';
import { getGetProjectInfo } from './getProjectInfo';
import { getImproveContext } from './improveContext';
import { getListContent } from './listContent';
import { getListKnowledgeDocuments } from './listKnowledgeDocuments';
import { getListProjects } from './listProjects';
import { getListWarehouseTables } from './listWarehouseTables';
import { getLoadSkill } from './loadSkill';
import { getReadContent } from './readContent';
import { getRunContentQuery } from './runContentQuery';
import { getRunSavedChart } from './runSavedChart';
import { getRunSql } from './runSql';
import { getSearchFieldValues } from './searchFieldValues';
import { getSetupPreviewDeploy } from './setupPreviewDeploy';

const schemaToJson = (schema: FlexibleSchema | undefined): unknown => {
    if (!schema) {
        return null;
    }

    return asSchema(schema).jsonSchema;
};

type SnapshotTool = {
    description?: string;
    inputSchema?: FlexibleSchema;
    outputSchema?: FlexibleSchema;
};

const agentToolSnapshot = (name: string, toolDefinition: SnapshotTool) => ({
    name,
    description: toolDefinition.description,
    inputSchema: schemaToJson(toolDefinition.inputSchema),
    ...(toolDefinition.outputSchema
        ? { outputSchema: schemaToJson(toolDefinition.outputSchema) }
        : {}),
});

const sharedAgentToolDefinitionNames = agentToolDefinitions.map(
    (toolDefinition) => toolDefinition.for('agent').name,
);

const makeAgentTools = () => {
    const noop = vi.fn();
    const noopAsync = vi.fn().mockResolvedValue(undefined);

    return {
        describeWarehouseTable: getDescribeWarehouseTable({
            describeWarehouseTable: noop,
        }),
        discoverFields: getDiscoverFields(
            {
                model: {} as never,
                callOptions: {},
                providerOptions: undefined,
                availableExplores: [],
                findFieldsPageSize: 25,
                promptUuid: 'prompt-uuid',
                telemetry: {
                    agentSettings: {
                        uuid: 'agent-uuid',
                        name: 'Agent',
                        projectUuid: 'project-uuid',
                    },
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                    telemetryEnabled: false,
                },
            } as never,
            {
                findExplores: noop,
                findFields: noop,
                getExplore: noop,
                listExplores: noop,
                storeToolCall: noopAsync,
                storeToolResults: noopAsync,
                updateProgress: noopAsync,
            } as never,
        ),
        createContent: getCreateContent({ createContent: noop }),
        editContent: getEditContent({ editContent: noop }),
        findContent: getFindContent({
            findContent: noop,
            siteUrl: 'https://lightdash.example',
            toolDescriptionMaxChars: 600,
            trackCoverage: noop,
        }),
        findExplores: getFindExplores({
            findExplores: noop,
            updateProgress: noopAsync,
        }),
        findFields: getFindFields({
            findFields: noop,
            getExplore: noop,
            pageSize: 25,
            updateProgress: noopAsync,
        }),
        generateDashboard: getGenerateDashboardV2({
            createOrUpdateArtifact: noop,
            getPrompt: noop,
        }),
        generateHashes: getGenerateHashes(),
        generateUuids: getGenerateUuids(),
        getDashboardCharts: getGetDashboardCharts({
            getDashboardCharts: noop,
            pageSize: 25,
            siteUrl: 'https://lightdash.example',
        }),
        getKnowledgeDocumentContent: getGetKnowledgeDocumentContent({
            getKnowledgeDocumentContent: noop,
        }),
        getProjectInfo: getGetProjectInfo({ getProjectInfo: noop }),
        improveContext: getImproveContext(),
        listContent: getListContent({ listContent: noop }),
        listKnowledgeDocuments: getListKnowledgeDocuments({
            listKnowledgeDocuments: noop,
        }),
        listProjects: getListProjects({ listProjects: noop }),
        listWarehouseTables: getListWarehouseTables({
            listWarehouseTables: noop,
        }),
        loadSkill: getLoadSkill({ loadSkill: noop }),
        editDbtProject: getEditDbtProject({
            editDbtProject: noop,
        }),
        editProjectContext: getEditProjectContext({
            editProjectContext: noop,
        }),
        setupPreviewDeploy: getSetupPreviewDeploy({
            setupPreviewDeploy: noop,
        }),
        exploreRepo: getExploreRepo({ exploreRepo: noop }),
        discoverRepos: getDiscoverRepos({ discoverRepos: noop }),
        readContent: getReadContent({ readContent: noop }),
        runContentQuery: getRunContentQuery({
            enableDataAccess: true,
            getSavedChart: noop,
            maxLimit: 500,
            runAsyncQuery: noop,
            runSavedChartQuery: noop,
            updateProgress: noopAsync,
            validateContent: noop,
        }),
        generateVisualization: getGenerateVisualization({
            createOrUpdateArtifact: noop,
            enableDataAccess: true,
            getPrompt: noop,
            maxLimit: 500,
            runAsyncQuery: noop,
            sendFile: noop,
            updateProgress: noopAsync,
        }),
        runSavedChart: getRunSavedChart({
            enableDataAccess: true,
            getSavedChart: noop,
            maxLimit: 500,
            runAsyncQuery: noop,
            updateProgress: noopAsync,
        }),
        runSql: getRunSql({
            getPrompt: noop,
            recordSqlApproval: noop,
            storeToolResults: noop,
            runSqlJob: noop,
            sendFile: noop,
            siteUrl: 'https://lightdash.example',
            maxQueryLimit: 500,
            updateProgress: noopAsync,
            updateSlackMessage: noop,
            waitForSqlApproval: noop,
        }),
        searchFieldValues: getSearchFieldValues({
            searchFieldValues: noop,
        }),
    };
};

describe('AI agent tool contracts', () => {
    it('matches the shared agent tool definition names snapshot', () => {
        expect(sharedAgentToolDefinitionNames).toMatchSnapshot();
    });

    it('matches the current agent tool contract snapshot', () => {
        const agentTools = makeAgentTools();

        expect(
            Object.entries(agentTools).map(([name, definition]) =>
                agentToolSnapshot(name, definition as SnapshotTool),
            ),
        ).toMatchSnapshot();
    });
});
