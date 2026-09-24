import type { ToolSet } from 'ai';
import type { TurnIntent } from '../decisions/prepareContext';
import type { DeferredPromptSection } from '../prompts/systemV2';
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

const PROMPT_SECTION_TOOLS: Record<DeferredPromptSection, string[]> = {
    runSql: [
        'runSql',
        'runComposerQueries',
        'listWarehouseTables',
        'describeWarehouseTable',
    ],
    contentTools: ['createContent', 'editContent'],
    schedulingTools: ['createScheduledDelivery'],
    generateDataApp: ['generateDataApp', 'iterateDataApp'],
    skills: ['loadSkill'],
};

/** Prompt sections whose tools are all outside the turn's initial toolbox. */
export const getDeferredPromptSections = (
    initialToolNames: ReadonlySet<string> | null,
): Set<DeferredPromptSection> => {
    if (!initialToolNames) return new Set();
    return new Set(
        (
            Object.entries(PROMPT_SECTION_TOOLS) as [
                DeferredPromptSection,
                string[],
            ][]
        )
            .filter(([, names]) =>
                names.every((name) => !initialToolNames.has(name)),
            )
            .map(([section]) => section),
    );
};

/** Union of the likely turn types' tools; null when any of them does not narrow the toolbox. */
const toolsForIntents = (intents: TurnIntent[]): Set<string> | null => {
    if (intents.length === 0) return null;
    const sets = intents.map(toolsForIntent);
    if (sets.some((set) => set === null)) return null;
    return new Set(sets.flatMap((set) => [...(set ?? [])]));
};

/** The tools a turn starts with, or null when the intents do not narrow the toolbox. */
export const getIntentToolNames = (
    tools: ToolSet,
    intents: TurnIntent[],
): Set<string> | null => {
    const intentTools = toolsForIntents(intents);
    if (!intentTools || !tools.loadAgentTools) return null;
    return new Set(Object.keys(tools).filter((name) => intentTools.has(name)));
};

/** `intent` is the confident turn type; `toolIntents` decide the starting toolbox. */
export const createIntentToolGate = (
    tools: ToolSet,
    intent: TurnIntent | null,
    toolIntents: TurnIntent[] = intent ? [intent] : [],
    deferredInstructions = '',
) => {
    const intentTools = toolsForIntents(toolIntents);
    let loaded = !intentTools || !tools.loadAgentTools;
    const restore = () => {
        loaded = true;
    };
    const gatedTools: ToolSet = loaded
        ? tools
        : {
              ...tools,
              loadAgentTools: getLoadAgentTools(restore, deferredInstructions),
          };
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
