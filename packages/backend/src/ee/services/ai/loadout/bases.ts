import { ADD_ON_NAMES, ADD_ONS, hasDecisionsInStandardMode } from './addOns';
import type {
    AgentToolName,
    BaseDefinition,
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
    'readPinnedThread',
    'resolveUrl',
    'runSavedChart',
    'generateHashes',
    'generateUuids',
];

const onlyIf = (
    condition: boolean,
    tools: readonly AgentToolName[],
): readonly AgentToolName[] => (condition ? tools : []);

// Deep research narrows tools only; its prompt still renders every applicable add-on section.
const applicableAddOnSections = (
    input: LoadoutInput,
): readonly PromptSection[] =>
    Object.values(ADD_ONS).flatMap(({ when: applies, section }) =>
        section && applies(input) ? [section.id] : [],
    );

export const BASES: Record<LoadoutBase, BaseDefinition> = {
    classic: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'generateVisualization',
            'searchFieldValues',
            ...onlyIf(hasDecisionsInStandardMode(input), [
                'runQuery',
                'exportChartAsCode',
            ]),
            ...onlyIf(input.canRunSql, ['runSql']),
        ],
        sections: [],
        accepts: ADD_ON_NAMES,
    }),
    // exportChartAsCode cannot export composer artifacts.
    composer: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'runComposerQueries',
            // The service enables composer only with data access; kept for exact parity.
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
        ],
        sections: ['queryingComposer'],
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
        accepts: ADD_ON_NAMES,
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
        sections: applicableAddOnSections(input),
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
        sections: applicableAddOnSections(input),
        accepts: [
            'contentReads',
            'legacyDashboards',
            'sqlCatalog',
            'projectContext',
        ],
    }),
};
