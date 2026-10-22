import { BASES, type LoadoutBase, type LoadoutInput } from '.';
import { AiDecisionClient } from '../decisions/AiDecisionClient';

// Every condition on: each base shows its widest query path.
export const fullInput: LoadoutInput = {
    execution: { mode: 'standard', maxSteps: 10 },
    decisions: new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    }),
    enableDataAccess: true,
    enableComposerQueries: false,
    canRunSql: true,
    canCreateDashboards: true,
    enableContentTools: true,
    enableDocuments: true,
    enableGenerateDataApp: true,
    enableAiWriteback: true,
    enableCodingAgent: true,
    enableRepoDiscovery: true,
    enablePreviewDeploySetup: true,
    enableEditProjectContext: true,
    enableReadAttachments: true,
    customSkills: [],
    projectContextEnabled: true,
    aiAgentMemoryEnabled: true,
    requestingUser: { name: 'Ada', role: null, groups: [] },
    mcpToolNames: ['mcp_linear__search_issues'],
    attachedMcpServerCount: 1,
    customChartTypeCount: 2,
};

// Every condition off.
export const minimalInput: LoadoutInput = {
    execution: { mode: 'standard', maxSteps: 10 },
    decisions: undefined,
    enableDataAccess: false,
    enableComposerQueries: false,
    canRunSql: false,
    canCreateDashboards: false,
    enableContentTools: false,
    enableDocuments: false,
    enableGenerateDataApp: false,
    enableAiWriteback: false,
    enableCodingAgent: false,
    enableRepoDiscovery: false,
    enablePreviewDeploySetup: false,
    enableEditProjectContext: false,
    enableReadAttachments: false,
    customSkills: [],
    projectContextEnabled: false,
    aiAgentMemoryEnabled: false,
    requestingUser: null,
    mcpToolNames: [],
    attachedMcpServerCount: 0,
    customChartTypeCount: 0,
};

const deepResearch = (
    research: Extract<
        LoadoutInput['execution'],
        { mode: 'deep_research' }
    >['research'],
): LoadoutInput['execution'] => ({
    mode: 'deep_research',
    runUuid: 'run',
    phase: 'investigating',
    maxSteps: 10,
    budget: {
        maxTokens: 1,
        maxToolCalls: 1,
        maxWarehouseQueries: 1,
        maxResultRows: 1,
        maxSteps: 1,
        deadlineMs: 1,
    },
    canUseRawSql: true,
    initialTokenUsage: 0,
    research,
});

export const inputs: Record<LoadoutBase, LoadoutInput> = {
    classic: fullInput,
    composer: { ...fullInput, enableComposerQueries: true },
    no_data_access: {
        ...fullInput,
        enableDataAccess: false,
        enableContentTools: false,
    },
    deep_research_worker: {
        ...fullInput,
        execution: deepResearch({
            role: 'worker',
            task: { id: 'task', question: 'Why?', focus: 'Orders' },
            onFindings: () => {},
        }),
    },
    deep_research_coordinator: {
        ...fullInput,
        execution: deepResearch({
            role: 'coordinator',
            runTask: async () => {
                throw new Error('not run');
            },
        }),
    },
};
export const BASE_NAMES = Object.keys(BASES) as LoadoutBase[];
