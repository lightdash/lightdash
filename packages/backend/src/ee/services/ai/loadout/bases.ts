import { ADD_ON_NAMES, ADD_ONS, applicableAddOns } from './addOns';
import type {
    AgentToolName,
    BaseDefinition,
    BuiltInSkillName,
    LoadoutBase,
    LoadoutInput,
    PromptSection,
} from './types';

const CORE_TOOLS: readonly AgentToolName[] = [
    'findContent',
    'grepFields',
    'getMetadata',
    'analyzeFieldImpact',
    'searchSemanticLayer',
    'listProjects',
    'getProjectInfo',
    'listKnowledgeDocuments',
    'getKnowledgeDocumentContent',
    'resolveUrl',
    'runSavedChart',
    'generateHashes',
    'generateUuids',
];

const onlyIf = (
    condition: boolean,
    tools: readonly AgentToolName[],
): readonly AgentToolName[] => (condition ? tools : []);

// Deep research narrows tools only; its prompt still renders every applicable add-on's sections and skills.
const applicableAddOnPrompt = (
    input: LoadoutInput,
): {
    sections: readonly PromptSection[];
    skills: readonly BuiltInSkillName[];
} => {
    const addOns = applicableAddOns(input).map((name) => ADD_ONS[name]);
    return {
        sections: addOns.flatMap(({ section }) =>
            section ? [section.id] : [],
        ),
        skills: addOns.flatMap(({ skills }) => skills),
    };
};

export const BASES: Record<LoadoutBase, BaseDefinition> = {
    classic: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'generateVisualization',
            'searchFieldValues',
            'runQuery',
            'exportChartAsCode',
            ...onlyIf(input.canRunSql, ['runSql']),
        ],
        sections: [],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // exportChartAsCode cannot export composer artifacts.
    composer: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'query',
            'visualize',
            // The service enables composer only with data access; kept for exact parity.
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
        ],
        sections: ['queryingComposer'],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // Today every add-on can apply without data access; narrowing it is a behaviour change.
    no_data_access: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'generateVisualization',
            ...onlyIf(input.canRunSql, ['runSql']),
        ],
        sections: [],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // Reads the layer and warehouse, and proposes; a person applies. No charts or content.
    // On a dbt project there is no draft: it reads the repository and edits it in a pull request.
    semantic_studio: (input) => ({
        tools: [
            'grepFields',
            'getMetadata',
            'searchSemanticLayer',
            'analyzeFieldImpact',
            'listChanges',
            ...onlyIf(input.semanticStudioDrafts, [
                'readSemanticModel',
                'proposeSemanticLayerChange',
            ]),
            // A dbt draft compiles after the turn, so a query there could read what is published and pass for the draft.
            ...onlyIf(input.semanticStudioDrafts && input.enableDataAccess, [
                'runMetricQuery',
            ]),
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
            ...onlyIf(input.canRunSql, ['runSql', 'grepWarehouseColumns']),
            // A dbt draft is a pull request whose branch compiles after a save; this waits for that compile.
            ...onlyIf(!input.semanticStudioDrafts && input.enableAiWriteback, [
                'verifyDbtChange',
            ]),
        ],
        sections: ['semanticStudio'],
        skills: [],
        accepts: input.semanticStudioDrafts
            ? ['sqlCatalog', 'projectContext', 'askUser']
            : [
                  'sqlCatalog',
                  'projectContext',
                  'repoDiscovery',
                  'writeback',
                  'pullRequests',
                  'askUser',
              ],
    }),
    deep_research_worker: (input) => ({
        tools: [
            'generateVisualization',
            'getMetadata',
            'grepFields',
            'searchSemanticLayer',
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
            ...onlyIf(input.canRunSql, ['runSql']),
            'submitWorkerFindings',
        ],
        ...applicableAddOnPrompt(input),
        accepts: ['sqlCatalog'],
    }),
    deep_research_coordinator: (input) => ({
        tools: [
            ...CORE_TOOLS.filter(
                (tool) => tool !== 'generateHashes' && tool !== 'generateUuids',
            ),
            'generateVisualization',
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
            ...onlyIf(input.canRunSql, ['runSql']),
            'delegateResearchTask',
        ],
        ...applicableAddOnPrompt(input),
        accepts: [
            'contentReads',
            'legacyDashboards',
            'sqlCatalog',
            'projectContext',
            'readPinnedThread',
        ],
    }),
};
