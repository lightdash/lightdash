import type {
    AddOnDefinition,
    AddOnName,
    DeferredPromptSection,
    LoadoutInput,
} from './types';

export const hasContentTools = (input: LoadoutInput): boolean =>
    input.enableDataAccess && input.enableContentTools;

export const hasProjectContextTool = (input: LoadoutInput): boolean =>
    input.projectContextEnabled || input.aiAgentMemoryEnabled;

const hasDecisionsInStandardMode = (input: LoadoutInput): boolean =>
    !!input.decisions && input.execution.mode === 'standard';

export const ADD_ONS: Record<AddOnName, AddOnDefinition> = {
    contentTools: {
        description: 'Read, edit, create and query saved charts and dashboards',
        when: hasContentTools,
        tools: [
            'readContent',
            'editContent',
            'listContent',
            'createContent',
            'runContentQuery',
        ],
        section: {
            id: 'contentTools',
            documents: ['createContent', 'editContent'],
        },
    },
    scheduling: {
        description: 'Schedule deliveries of saved content',
        when: hasContentTools,
        tools: ['createScheduledDelivery'],
        section: {
            id: 'schedulingTools',
            documents: ['createScheduledDelivery'],
        },
    },
    legacyDashboards: {
        description: 'Read dashboard charts when content tools are off',
        when: (input) => !hasContentTools(input),
        tools: ['getDashboardCharts'],
        section: null,
    },
    generateDashboard: {
        description:
            'Build dashboards when content tools are off and the user can save one',
        when: (input) => !hasContentTools(input) && input.canCreateDashboards,
        tools: ['generateDashboard'],
        section: null,
    },
    documents: {
        description: 'Document authoring guidance inside the content section',
        when: (input) => hasContentTools(input) && input.enableDocuments,
        tools: [],
        section: { id: 'documents', documents: [] },
    },
    generateDataApp: {
        description: 'Start and iterate data app builds',
        when: (input) => input.enableGenerateDataApp,
        tools: [
            'generateDataApp',
            'iterateDataApp',
            'listDataAppThemes',
            'listDataAppConnections',
        ],
        section: {
            id: 'generateDataApp',
            documents: ['generateDataApp', 'iterateDataApp'],
        },
    },
    sqlCatalog: {
        description: 'Browse warehouse tables and the raw SQL guidance',
        when: (input) => input.canRunSql,
        tools: ['listWarehouseTables', 'describeWarehouseTable'],
        // The base owns runSql or runComposerQueries; this section explains both.
        section: {
            id: 'runSql',
            documents: [
                'runSql',
                'runComposerQueries',
                'listWarehouseTables',
                'describeWarehouseTable',
            ],
        },
    },
    writeback: {
        description: 'Edit and sync the dbt project through pull requests',
        when: (input) => input.enableAiWriteback,
        tools: ['editDbtProject', 'syncDbtProject'],
        section: {
            id: 'aiWriteback',
            documents: ['editDbtProject', 'syncDbtProject'],
        },
    },
    codingAgent: {
        description: 'Edit any writable repository through pull requests',
        when: (input) => input.enableCodingAgent,
        tools: ['editRepo'],
        section: { id: 'codingAgent', documents: ['editRepo'] },
    },
    pullRequests: {
        description: 'List, inspect and close the pull requests of a thread',
        when: (input) => input.enableAiWriteback || input.enableCodingAgent,
        tools: ['listWorkstreams', 'closePullRequest', 'getPullRequestDiff'],
        section: null,
    },
    repoDiscovery: {
        description: 'Read repositories the user can access',
        when: (input) => input.enableRepoDiscovery,
        tools: ['exploreRepo', 'discoverRepos'],
        section: { id: 'repoFs', documents: ['exploreRepo', 'discoverRepos'] },
    },
    previewDeploySetup: {
        description: 'Set up preview deploys for the dbt project',
        when: (input) => input.enablePreviewDeploySetup,
        tools: ['setupPreviewDeploy'],
        section: null,
    },
    editProjectContext: {
        description:
            'Change the project context pull request in review threads',
        when: (input) => input.enableEditProjectContext,
        tools: ['editProjectContext'],
        section: null,
    },
    readAttachments: {
        description: 'Read files attached to the thread',
        when: (input) => input.enableReadAttachments,
        tools: ['readAttachments'],
        section: null,
    },
    intentRouting: {
        description:
            'Start each turn with the tools its intent needs and the fast decision guidance',
        when: hasDecisionsInStandardMode,
        tools: ['loadAgentTools'],
        section: { id: 'fastMetadata', documents: [] },
    },
    skills: {
        description: 'Load skills enabled on the agent',
        when: (input) => input.availableSkills.length > 0,
        tools: ['loadSkill'],
        section: { id: 'skills', documents: ['loadSkill'] },
    },
    mcp: {
        description: 'Load tools from attached MCP servers on demand',
        when: (input) => input.mcpToolNames.length > 0,
        tools: ['loadMcpTools'],
        // The MCP inventory block renders from attached servers, even ones without tools.
        section: null,
    },
    projectContext: {
        description: 'Load curated project context and memories',
        when: hasProjectContextTool,
        tools: ['loadProjectContext'],
        section: null,
    },
    memories: {
        description: 'Guidance for saving and using agent memories',
        when: (input) => input.aiAgentMemoryEnabled,
        tools: [],
        section: { id: 'memories', documents: [] },
    },
    customChartTypes: {
        description: "Find the project's custom chart types",
        when: (input) => input.customChartTypeCount > 0,
        tools: ['findCustomChartTypes'],
        section: {
            id: 'availableCustomChartTypes',
            documents: ['findCustomChartTypes'],
        },
    },
    userIdentity: {
        description:
            'Tell the agent who it is talking to and let it fix their name',
        when: (input) => !!input.requestingUser,
        tools: ['updateUserName'],
        section: { id: 'requestingUser', documents: ['updateUserName'] },
    },
};

export const ADD_ON_NAMES = Object.keys(ADD_ONS) as AddOnName[];

const DEFERRED_PROMPT_SECTIONS: readonly DeferredPromptSection[] = [
    'runSql',
    'contentTools',
    'schedulingTools',
    'generateDataApp',
    'skills',
];

/** Tools each deferrable section explains, derived from the add-on that owns it. */
export const DEFERRED_SECTION_TOOLS: ReadonlyMap<
    DeferredPromptSection,
    readonly string[]
> = new Map(
    DEFERRED_PROMPT_SECTIONS.map((id) => [
        id,
        Object.values(ADD_ONS).flatMap(({ section }) =>
            section?.id === id ? section.documents : [],
        ),
    ]),
);
