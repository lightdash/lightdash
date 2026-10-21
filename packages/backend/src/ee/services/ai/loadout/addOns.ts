import {
    DEFERRED_PROMPT_SECTIONS,
    type AddOnDefinition,
    type AddOnName,
    type AgentToolName,
    type DeferredPromptSection,
    type LoadoutInput,
} from './types';

const hasContentTools = (input: LoadoutInput): boolean =>
    input.enableDataAccess && input.enableContentTools;

const hasProjectContextTool = (input: LoadoutInput): boolean =>
    input.projectContextEnabled || input.aiAgentMemoryEnabled;

export const hasDecisionsInStandardMode = (
    input: Pick<LoadoutInput, 'decisions' | 'execution'>,
): boolean => !!input.decisions && input.execution.mode === 'standard';

export const ADD_ONS: Record<AddOnName, AddOnDefinition> = {
    contentReads: {
        description: 'Read and query saved charts and dashboards',
        when: hasContentTools,
        tools: ['readContent', 'listContent', 'runContentQuery'],
        section: null,
        skills: [],
    },
    contentTools: {
        description: 'Edit and create saved charts and dashboards',
        when: hasContentTools,
        tools: ['editContent', 'createContent'],
        section: {
            id: 'contentTools',
            documents: ['createContent', 'editContent'],
        },
        skills: ['developing-in-lightdash'],
    },
    scheduling: {
        description: 'Schedule deliveries of saved content',
        when: hasContentTools,
        tools: ['createScheduledDelivery'],
        section: {
            id: 'schedulingTools',
            documents: ['createScheduledDelivery'],
        },
        skills: [],
    },
    legacyDashboards: {
        description: 'Read dashboard charts when content tools are off',
        when: (input) => !hasContentTools(input),
        tools: ['getDashboardCharts'],
        section: null,
        skills: [],
    },
    generateDashboard: {
        description:
            'Build dashboards when content tools are off and the user can save one',
        when: (input) => !hasContentTools(input) && input.canCreateDashboards,
        tools: ['generateDashboard'],
        section: null,
        skills: [],
    },
    documents: {
        description: 'Document authoring guidance inside the content section',
        when: (input) => hasContentTools(input) && input.enableDocuments,
        tools: [],
        section: { id: 'documents', documents: [] },
        skills: [],
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
        skills: [],
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
        skills: [],
    },
    writeback: {
        description: 'Edit and sync the dbt project through pull requests',
        when: (input) => input.enableAiWriteback,
        tools: ['editDbtProject', 'syncDbtProject'],
        section: {
            id: 'aiWriteback',
            documents: ['editDbtProject', 'syncDbtProject'],
        },
        skills: [],
    },
    codingAgent: {
        description: 'Edit any writable repository through pull requests',
        when: (input) => input.enableCodingAgent,
        tools: ['editRepo'],
        section: { id: 'codingAgent', documents: ['editRepo'] },
        skills: [],
    },
    pullRequests: {
        description: 'List, inspect and close the pull requests of a thread',
        when: (input) => input.enableAiWriteback || input.enableCodingAgent,
        tools: ['listWorkstreams', 'closePullRequest', 'getPullRequestDiff'],
        section: null,
        skills: [],
    },
    repoDiscovery: {
        description: 'Read repositories the user can access',
        when: (input) => input.enableRepoDiscovery,
        tools: ['exploreRepo', 'discoverRepos'],
        section: { id: 'repoFs', documents: ['exploreRepo', 'discoverRepos'] },
        skills: [],
    },
    previewDeploySetup: {
        description: 'Set up preview deploys for the dbt project',
        when: (input) => input.enablePreviewDeploySetup,
        tools: ['setupPreviewDeploy'],
        section: null,
        skills: [],
    },
    editProjectContext: {
        description:
            'Change the project context pull request in review threads',
        when: (input) => input.enableEditProjectContext,
        tools: ['editProjectContext'],
        section: null,
        skills: [],
    },
    readAttachments: {
        description: 'Read files attached to the thread',
        when: (input) => input.enableReadAttachments,
        tools: ['readAttachments'],
        section: null,
        skills: [],
    },
    intentRouting: {
        description: 'Start each turn with the tools its intent needs',
        when: hasDecisionsInStandardMode,
        tools: ['loadAgentTools'],
        section: null,
        skills: [],
    },
    skills: {
        description: 'Load built-in skills of active add-ons and agent skills',
        when: (input) => input.customSkills.length > 0,
        tools: ['loadSkill'],
        section: { id: 'skills', documents: ['loadSkill'] },
        skills: [],
    },
    mcp: {
        description: 'Load tools from attached MCP servers on demand',
        when: (input) => input.mcpToolNames.length > 0,
        tools: ['loadMcpTools'],
        section: null,
        skills: [],
    },
    mcpInventory: {
        description:
            'List attached MCP servers and their tools, even when none can run',
        when: (input) => input.attachedMcpServerCount > 0,
        tools: [],
        section: { id: 'mcpTools', documents: [] },
        skills: [],
    },
    projectContext: {
        description: 'Load curated project context and memories',
        when: hasProjectContextTool,
        tools: ['loadProjectContext'],
        section: { id: 'projectContext', documents: ['loadProjectContext'] },
        skills: [],
    },
    memories: {
        description: 'Guidance for saving and using agent memories',
        when: (input) => input.aiAgentMemoryEnabled,
        tools: [],
        section: { id: 'memories', documents: [] },
        skills: [],
    },
    customChartTypes: {
        description: "Find the project's custom chart types",
        when: (input) => input.customChartTypeCount > 0,
        tools: ['findCustomChartTypes'],
        section: {
            id: 'availableCustomChartTypes',
            documents: ['findCustomChartTypes'],
        },
        skills: [],
    },
    userIdentity: {
        description:
            'Tell the agent who it is talking to and let it fix their name',
        when: (input) => !!input.requestingUser,
        tools: ['updateUserName'],
        section: { id: 'requestingUser', documents: ['updateUserName'] },
        skills: [],
    },
};

export const ADD_ON_NAMES = Object.keys(ADD_ONS) as AddOnName[];

/** Adds `skills` when an add-on declares a skill, since skills load through its tool. */
export const withImpliedAddOns = (names: readonly AddOnName[]): AddOnName[] => {
    const impliesSkills = names.some((name) => ADD_ONS[name].skills.length > 0);
    return ADD_ON_NAMES.filter(
        (name) => names.includes(name) || (name === 'skills' && impliesSkills),
    );
};

/** Add-ons whose condition holds, before a base filters them. */
export const applicableAddOns = (input: LoadoutInput): AddOnName[] =>
    withImpliedAddOns(ADD_ON_NAMES.filter((name) => ADD_ONS[name].when(input)));

/** Tools each deferrable section explains, derived from the add-on that owns it. */
export const DEFERRED_SECTION_TOOLS: ReadonlyMap<
    DeferredPromptSection,
    readonly AgentToolName[]
> = new Map(
    DEFERRED_PROMPT_SECTIONS.map((id) => [
        id,
        Object.values(ADD_ONS).flatMap(({ section }) =>
            section?.id === id ? section.documents : [],
        ),
    ]),
);
