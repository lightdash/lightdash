import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getDiscoverFields } from '../agents/discoverFields/tool';
import { getCreateContent } from './createContent';
import { getDescribeWarehouseTable } from './describeWarehouseTable';
import { getEditContent } from './editContent';
import { getFindContent } from './findContent';
import { getFindExplores } from './findExplores';
import { getFindFields } from './findFields';
import { getGenerateDashboardV2 } from './generateDashboardV2';
import { getGenerateUuids } from './generateUuids';
import { getGetDashboardCharts } from './getDashboardCharts';
import { getGetKnowledgeDocumentContent } from './getKnowledgeDocumentContent';
import { getImproveContext } from './improveContext';
import { getListContent } from './listContent';
import { getListKnowledgeDocuments } from './listKnowledgeDocuments';
import { getListWarehouseTables } from './listWarehouseTables';
import { getLoadSkill } from './loadSkill';
import { getProposeChange } from './proposeChange';
import { getProposeWriteback } from './proposeWriteback';
import { getReadContent } from './readContent';
import { getRunQuery } from './runQuery';
import { getRunSavedChart } from './runSavedChart';
import { getRunSql } from './runSql';
import { getSearchFieldValues } from './searchFieldValues';

const schemaToJson = (schema: ZodTypeAny | undefined): unknown => {
    if (!schema) {
        return null;
    }

    return zodToJsonSchema(schema, {
        target: 'jsonSchema7',
    });
};

type SnapshotTool = {
    description?: string;
    inputSchema?: ZodTypeAny;
    outputSchema?: ZodTypeAny;
};

const agentToolSnapshot = (name: string, toolDefinition: SnapshotTool) => ({
    name,
    description: toolDefinition.description,
    inputSchema: schemaToJson(toolDefinition.inputSchema),
    ...(toolDefinition.outputSchema
        ? { outputSchema: schemaToJson(toolDefinition.outputSchema) }
        : {}),
});

const makeAgentTools = () => {
    const noop = jest.fn();
    const noopAsync = jest.fn().mockResolvedValue(undefined);

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
                findExploresFieldSearchSize: 25,
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
            trackCoverage: noop,
        }),
        findExplores: getFindExplores({
            fieldSearchSize: 25,
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
        generateUuids: getGenerateUuids(),
        getDashboardCharts: getGetDashboardCharts({
            getDashboardCharts: noop,
            pageSize: 25,
            siteUrl: 'https://lightdash.example',
        }),
        getKnowledgeDocumentContent: getGetKnowledgeDocumentContent({
            getKnowledgeDocumentContent: noop,
        }),
        improveContext: getImproveContext(),
        listContent: getListContent({ listContent: noop }),
        listKnowledgeDocuments: getListKnowledgeDocuments({
            listKnowledgeDocuments: noop,
        }),
        listWarehouseTables: getListWarehouseTables({
            listWarehouseTables: noop,
        }),
        loadSkill: getLoadSkill({ loadSkill: noop }),
        proposeChange: getProposeChange({
            createChange: noop,
            getExploreCompiler: noop,
        }),
        proposeWriteback: getProposeWriteback({
            proposeWriteback: noop,
        }),
        readContent: getReadContent({ readContent: noop }),
        runQuery: getRunQuery({
            createOrUpdateArtifact: noop,
            enableDataAccess: true,
            enableSelfImprovement: true,
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
    it('matches the current agent tool contract snapshot', () => {
        const agentTools = makeAgentTools();

        expect(
            Object.entries(agentTools).map(([name, definition]) =>
                agentToolSnapshot(name, definition as SnapshotTool),
            ),
        ).toMatchSnapshot();
    });
});
