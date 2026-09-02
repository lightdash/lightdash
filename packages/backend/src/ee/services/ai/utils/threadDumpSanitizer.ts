import { assertUnreachable, type ToolName } from '@lightdash/common';
import { shapeRowsInResult } from '../../AiAgentMemoryService/transcriptToolPolicy';

type DumpToolResultPolicy = 'keep' | 'strip_rows' | 'omit_values' | 'omit';

// Exhaustive over ToolName: adding a tool to ToolNameSchema fails compilation
// here until its result is consciously classified, so a new tool can't leak
// warehouse data through a shared debug dump by omission.
const DUMP_TOOL_RESULT_POLICIES = {
    // schema/metadata/config results carry field, table and content names, not cell values
    grepFields: 'keep',
    discoverFields: 'keep',
    getMetadata: 'keep',
    findExplores: 'keep',
    findCustomChartTypes: 'keep',
    findFields: 'keep',
    searchSemanticLayer: 'keep',
    analyzeFieldImpact: 'keep',
    listWarehouseTables: 'keep',
    describeWarehouseTable: 'keep',
    getProjectInfo: 'keep',
    listProjects: 'keep',
    findContent: 'keep',
    findCharts: 'keep',
    findDashboards: 'keep',
    listContent: 'keep',
    readContent: 'keep',
    resolveUrl: 'keep',
    editContent: 'keep',
    createContent: 'keep',
    createScheduledDelivery: 'keep',
    updateUserName: 'keep',
    listKnowledgeDocuments: 'keep',
    generateHashes: 'keep',
    generateUuids: 'keep',
    loadMcpTools: 'keep',
    generateDataApp: 'keep',
    iterateDataApp: 'keep',
    editDbtProject: 'keep',
    editRepo: 'keep',
    syncDbtProject: 'keep',
    discoverRepos: 'keep',
    listWorkstreams: 'keep',
    closePullRequest: 'keep',
    setupPreviewDeploy: 'keep',
    // agent-authored prose, same posture as assistant messages
    submitResearchReport: 'keep',
    delegateResearchTask: 'keep',
    submitWorkerFindings: 'keep',
    // query results embed rows as a fenced csv block; keep the summary line,
    // column names and row counts, drop the cell values
    runQuery: 'strip_rows',
    runSavedChart: 'strip_rows',
    runContentQuery: 'strip_rows',
    runSql: 'strip_rows',
    runComposerQueries: 'strip_rows',
    generateVisualization: 'strip_rows',
    getDashboardCharts: 'strip_rows',
    generateDashboard: 'strip_rows',
    // results are raw cell values
    searchFieldValues: 'omit_values',
    // customer documents, memory-derived context and repo contents can quote
    // anything, including data values
    loadSkill: 'omit',
    loadProjectContext: 'omit',
    editProjectContext: 'omit',
    getKnowledgeDocumentContent: 'omit',
    readPinnedThread: 'omit',
    exploreRepo: 'omit',
    getPullRequestDiff: 'omit',
} as const satisfies Record<ToolName, DumpToolResultPolicy>;

// Tool names persisted by past releases that are no longer in ToolNameSchema.
const LEGACY_DUMP_TOOL_RESULT_POLICIES: Partial<
    Record<string, DumpToolResultPolicy>
> = {
    runMetricQuery: 'strip_rows',
    improveContext: 'omit',
    submitDiscoverFieldsResult: 'keep',
    generateBarVizConfig: 'keep',
    generateTableVizConfig: 'keep',
    generateTimeSeriesVizConfig: 'keep',
};

export const DUMP_UNCLASSIFIED_RESULT_OMITTED = 'unclassified tool result';
export const DUMP_POLICY_RESULT_OMITTED = 'omitted by policy';
export const DUMP_FIELD_VALUES_OMITTED = 'field values';

export type SanitizedDumpToolResult = {
    result: string | null;
    resultOmitted: string | null;
};

const getDumpToolResultPolicy = (tool: {
    name: string;
    source: 'lightdash' | 'mcp';
}): DumpToolResultPolicy | undefined => {
    if (tool.source === 'mcp') return undefined;
    return (
        (
            DUMP_TOOL_RESULT_POLICIES as Partial<
                Record<string, DumpToolResultPolicy>
            >
        )[tool.name] ?? LEGACY_DUMP_TOOL_RESULT_POLICIES[tool.name]
    );
};

export const sanitizeToolResultForDump = async (tool: {
    name: string;
    source: 'lightdash' | 'mcp';
    result: string | null;
    isError: boolean;
}): Promise<SanitizedDumpToolResult> => {
    if (tool.result === null) {
        return { result: null, resultOmitted: null };
    }
    // error text is the diagnostic payload and never carries query rows
    if (tool.isError) {
        return { result: tool.result, resultOmitted: null };
    }

    const policy = getDumpToolResultPolicy(tool);
    switch (policy) {
        case 'keep':
            return { result: tool.result, resultOmitted: null };
        case 'strip_rows':
            return {
                result: await shapeRowsInResult(tool.result, false),
                resultOmitted: null,
            };
        case 'omit_values':
            return { result: null, resultOmitted: DUMP_FIELD_VALUES_OMITTED };
        case 'omit':
            return { result: null, resultOmitted: DUMP_POLICY_RESULT_OMITTED };
        case undefined:
            return {
                result: null,
                resultOmitted: DUMP_UNCLASSIFIED_RESULT_OMITTED,
            };
        default:
            return assertUnreachable(policy, 'Unknown dump tool policy');
    }
};
