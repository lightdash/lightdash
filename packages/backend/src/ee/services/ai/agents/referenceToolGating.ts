import type { ToolSet } from 'ai';
import type { TurnIntent } from '../decisions/prepareContext';
import { getLoadAgentTools } from '../tools/loadAgentTools';

const REFERENCE_TOOLS = new Set([
    'loadAgentTools',
    'listKnowledgeDocuments',
    'getKnowledgeDocumentContent',
    'loadProjectContext',
    'readPinnedThread',
    'resolveUrl',
    'getProjectInfo',
    'listProjects',
    'readContent',
    'listContent',
    'findContent',
    'grepFields',
    'getMetadata',
    'findExplores',
    'findFields',
    'searchSemanticLayer',
]);

const DATA_ANSWER_TOOLS = new Set([
    ...REFERENCE_TOOLS,
    'runQuery',
    'runSavedChart',
    'runContentQuery',
    'searchFieldValues',
]);

const CHART_TOOLS = new Set([
    ...REFERENCE_TOOLS,
    'generateVisualization',
    'exportChartAsCode',
    'findCustomChartTypes',
    'getDashboardCharts',
    'runSavedChart',
    'runContentQuery',
    'searchFieldValues',
]);

const CHART_EXPORT_TOOLS = new Set(['loadAgentTools', 'exportChartAsCode']);

const DATA_APP_CREATE_TOOLS = new Set([
    ...REFERENCE_TOOLS,
    'generateDataApp',
    'listDataAppThemes',
]);

const DATA_APP_ITERATE_TOOLS = new Set([
    ...REFERENCE_TOOLS,
    'iterateDataApp',
    'listDataAppThemes',
]);

const DATA_APP_READ_TOOLS = new Set(REFERENCE_TOOLS);

const REPOSITORY_CHANGE_TOOLS = new Set([
    ...REFERENCE_TOOLS,
    'analyzeFieldImpact',
    'editDbtProject',
    'editProjectContext',
    'editRepo',
    'syncDbtProject',
    'setupPreviewDeploy',
    'exploreRepo',
    'discoverRepos',
    'listWorkstreams',
    'closePullRequest',
    'getPullRequestDiff',
    'generateHashes',
    'generateUuids',
]);

const toolsForIntent = (intent: TurnIntent | null): Set<string> | null => {
    switch (intent) {
        case 'reference_answer':
            return REFERENCE_TOOLS;
        case 'data_answer':
            return DATA_ANSWER_TOOLS;
        case 'chart':
        case 'chart_from_previous':
            return CHART_TOOLS;
        case 'chart_export':
            return CHART_EXPORT_TOOLS;
        case 'data_app_create':
            return DATA_APP_CREATE_TOOLS;
        case 'data_app_iterate':
            return DATA_APP_ITERATE_TOOLS;
        case 'data_app_read':
            return DATA_APP_READ_TOOLS;
        case 'repository_change':
            return REPOSITORY_CHANGE_TOOLS;
        case 'other':
        case null:
            return null;
        default:
            return intent satisfies never;
    }
};

export const createIntentToolGate = (
    tools: ToolSet,
    intent: TurnIntent | null,
) => {
    const intentTools = toolsForIntent(intent);
    let loaded = !intentTools || !tools.loadAgentTools;
    const restore = () => {
        loaded = true;
    };
    const gatedTools: ToolSet = loaded
        ? tools
        : { ...tools, loadAgentTools: getLoadAgentTools(restore) };
    return {
        tools: gatedTools,
        intent,
        restore,
        activeTools: (): string[] | undefined =>
            loaded
                ? undefined
                : Object.keys(tools).filter((name) => intentTools?.has(name)),
    };
};

export type IntentToolGate = ReturnType<typeof createIntentToolGate>;
