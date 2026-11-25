import {
    ADD_ON_NAMES,
    ADD_ONS,
    applicableAddOns,
    hasContentReads,
    hasProjectContextTool,
} from './addOns';
import type {
    AgentToolName,
    BaseDefinition,
    BuiltInSkillName,
    LoadoutBase,
    LoadoutInput,
    PromptSection,
} from './types';

const onlyIf = (
    condition: boolean,
    tools: readonly AgentToolName[],
): readonly AgentToolName[] => (condition ? tools : []);

const coreTools = (input: LoadoutInput): readonly AgentToolName[] => [
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
    // runContentQuery runs saved charts when content reads are on.
    ...onlyIf(!hasContentReads(input), ['runSavedChart']),
    'generateHashes',
    'generateUuids',
];

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
            ...coreTools(input),
            'generateVisualization',
            'searchFieldValues',
            'runQuery',
            'exportChartAsCode',
            ...onlyIf(input.canRunSql, ['runSql']),
        ],
        withheldTools: [],
        sections: [],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // exportChartAsCode cannot export composer artifacts.
    composer: (input) => ({
        tools: [
            ...coreTools(input),
            'query',
            'visualize',
            // The service enables composer only with data access; kept for exact parity.
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
        ],
        withheldTools: [],
        sections: ['queryingComposer'],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // Today every add-on can apply without data access; narrowing it is a behaviour change.
    no_data_access: (input) => ({
        tools: [
            ...coreTools(input),
            'generateVisualization',
            ...onlyIf(input.canRunSql, ['runSql']),
        ],
        withheldTools: [],
        sections: [],
        skills: [],
        accepts: ADD_ON_NAMES,
    }),
    // Reads the layer and warehouse, and proposes; a person applies. No charts or content.
    // On a dbt project with writeback it is the builder: read, write and verify, with every lookup inside read.
    semantic_studio: (input) =>
        !input.semanticStudioDrafts && input.enableAiWriteback
            ? {
                  tools: [
                      'read',
                      'write',
                      'verify',
                      ...onlyIf(input.canRunSql, ['runSql']),
                  ],
                  withheldTools: [
                      'grepFields',
                      'getMetadata',
                      'searchSemanticLayer',
                      'analyzeFieldImpact',
                      'listChanges',
                      ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
                      ...onlyIf(input.canRunSql, [
                          'grepWarehouseColumns',
                          'listWarehouseTables',
                          'describeWarehouseTable',
                      ]),
                      ...onlyIf(hasProjectContextTool(input), [
                          'loadProjectContext',
                      ]),
                      'editDbtProject',
                      'listWorkstreams',
                      'getPullRequestDiff',
                      // Publishing the draft recompiles the project, and the person discards it from the page.
                      'syncDbtProject',
                      'closePullRequest',
                  ],
                  sections: ['semanticStudio'],
                  skills: [],
                  accepts: [
                      'sqlCatalog',
                      'projectContext',
                      'writeback',
                      'pullRequests',
                      'askUser',
                  ],
              }
            : {
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
                      // Agents read published context only where project context is on.
                      ...onlyIf(
                          input.semanticStudioKeepsContext &&
                              input.projectContextEnabled,
                          ['draftProjectContext'],
                      ),
                      // A dbt draft compiles after the turn, so a query there could read what is published and pass for the draft.
                      ...onlyIf(
                          input.semanticStudioDrafts && input.enableDataAccess,
                          ['runMetricQuery'],
                      ),
                      ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
                      ...onlyIf(input.canRunSql, [
                          'runSql',
                          'grepWarehouseColumns',
                      ]),
                  ],
                  withheldTools: [],
                  sections: ['semanticStudio'],
                  skills: [],
                  accepts: input.semanticStudioDrafts
                      ? ['sqlCatalog', 'projectContext', 'askUser']
                      : [
                            'sqlCatalog',
                            'projectContext',
                            'repoDiscovery',
                            'askUser',
                        ],
              },
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
        withheldTools: [],
        ...applicableAddOnPrompt(input),
        accepts: ['sqlCatalog'],
    }),
    deep_research_coordinator: (input) => ({
        tools: [
            ...coreTools(input).filter(
                (tool) => tool !== 'generateHashes' && tool !== 'generateUuids',
            ),
            'generateVisualization',
            ...onlyIf(input.enableDataAccess, ['searchFieldValues']),
            ...onlyIf(input.canRunSql, ['runSql']),
            'delegateResearchTask',
        ],
        withheldTools: [],
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
