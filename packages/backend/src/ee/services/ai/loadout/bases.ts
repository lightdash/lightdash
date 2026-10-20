import {
    ADD_ON_NAMES,
    ADD_ONS,
    hasContentTools,
    hasProjectContextTool,
} from './addOns';
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
    'generateVisualization',
    'runSavedChart',
    'generateHashes',
    'generateUuids',
];

const when = <T>(condition: boolean, items: readonly T[]): readonly T[] =>
    condition ? items : [];

const hasClassicQueryTools = (input: LoadoutInput): boolean =>
    !!input.decisions && input.execution.mode === 'standard';

const canRunRawSql = (input: LoadoutInput): boolean =>
    input.canRunSql && !input.enableComposerQueries;

const sqlTools = (input: LoadoutInput): readonly AgentToolName[] => [
    ...when<AgentToolName>(input.canRunSql, [
        'listWarehouseTables',
        'describeWarehouseTable',
    ]),
    ...when<AgentToolName>(canRunRawSql(input), ['runSql']),
];

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
            'searchFieldValues',
            ...when<AgentToolName>(hasClassicQueryTools(input), [
                'runQuery',
                'exportChartAsCode',
            ]),
            ...when<AgentToolName>(input.canRunSql, ['runSql']),
        ],
        sections: [],
        accepts: ADD_ON_NAMES,
    }),
    // runQuery and generateVisualization stay until the composer-only agent (ZAP-1274).
    composer: (input) => ({
        tools: [
            ...CORE_TOOLS,
            'runComposerQueries',
            // The service enables composer only with data access; kept for exact parity.
            ...when<AgentToolName>(input.enableDataAccess, [
                'searchFieldValues',
            ]),
            ...when<AgentToolName>(
                input.enableDataAccess && hasClassicQueryTools(input),
                ['runQuery', 'exportChartAsCode'],
            ),
        ],
        sections: [],
        accepts: ADD_ON_NAMES,
    }),
    // Today every add-on can apply without data access; narrowing it is a behaviour change.
    no_data_access: (input) => ({
        tools: [
            ...CORE_TOOLS,
            ...when<AgentToolName>(input.canRunSql, ['runSql']),
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
            ...when<AgentToolName>(input.enableDataAccess, [
                'searchFieldValues',
            ]),
            ...sqlTools(input),
            'submitWorkerFindings',
        ],
        sections: applicableAddOnSections(input),
        accepts: [],
    }),
    deep_research_coordinator: (input) => ({
        tools: [
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
            'generateVisualization',
            'runSavedChart',
            ...(hasContentTools(input)
                ? (['readContent', 'listContent', 'runContentQuery'] as const)
                : (['getDashboardCharts'] as const)),
            ...when<AgentToolName>(input.enableDataAccess, [
                'searchFieldValues',
            ]),
            ...sqlTools(input),
            ...when<AgentToolName>(hasProjectContextTool(input), [
                'loadProjectContext',
            ]),
            'delegateResearchTask',
        ],
        sections: applicableAddOnSections(input),
        accepts: [],
    }),
};
