import type { AiAgentLoadoutBase } from '@lightdash/common';
import type { AiAgentArgs } from '../types/aiAgent';

export type LoadoutBase = AiAgentLoadoutBase;

export type AddOnName =
    | 'contentReads'
    | 'contentTools'
    | 'scheduling'
    | 'legacyDashboards'
    | 'generateDashboard'
    | 'documents'
    | 'generateDataApp'
    | 'sqlCatalog'
    | 'writeback'
    | 'codingAgent'
    | 'pullRequests'
    | 'repoDiscovery'
    | 'previewDeploySetup'
    | 'editProjectContext'
    | 'readAttachments'
    | 'intentRouting'
    | 'skills'
    | 'mcp'
    | 'mcpInventory'
    | 'projectContext'
    | 'memories'
    | 'customChartTypes'
    | 'userIdentity';

/** Agent tools built by `getAgentTools`; MCP server tools are dynamic and not listed. */
export const AGENT_TOOL_NAMES = [
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
    'updateUserName',
    'readContent',
    'editContent',
    'listContent',
    'createContent',
    'createScheduledDelivery',
    'runContentQuery',
    'getDashboardCharts',
    'generateDashboard',
    'generateVisualization',
    'runQuery',
    'exportChartAsCode',
    'runSavedChart',
    'generateHashes',
    'generateUuids',
    'generateDataApp',
    'iterateDataApp',
    'listDataAppThemes',
    'listDataAppConnections',
    'editDbtProject',
    'editProjectContext',
    'editRepo',
    'syncDbtProject',
    'setupPreviewDeploy',
    'exploreRepo',
    'readAttachments',
    'discoverRepos',
    'listWorkstreams',
    'closePullRequest',
    'getPullRequestDiff',
    'searchFieldValues',
    'findCustomChartTypes',
    'runSql',
    'runComposerQueries',
    'listWarehouseTables',
    'describeWarehouseTable',
    'loadSkill',
    'loadProjectContext',
    'loadMcpTools',
    'loadAgentTools',
    'delegateResearchTask',
    'submitWorkerFindings',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Built-in skills available to the agent; a test pins them to `skills/builtInSkills/`. */
export const BUILT_IN_SKILL_NAMES = ['developing-in-lightdash'] as const;

export type BuiltInSkillName = (typeof BUILT_IN_SKILL_NAMES)[number];

export type PromptSection =
    | 'queryingComposer'
    | 'runSql'
    | 'contentTools'
    | 'schedulingTools'
    | 'documents'
    | 'generateDataApp'
    | 'aiWriteback'
    | 'codingAgent'
    | 'repoFs'
    | 'skills'
    | 'mcpTools'
    | 'projectContext'
    | 'memories'
    | 'availableCustomChartTypes'
    | 'requestingUser';

/** Sections the intent gate may withhold until the agent loads their tools. */
export const DEFERRED_PROMPT_SECTIONS = [
    'runSql',
    'contentTools',
    'schedulingTools',
    'generateDataApp',
    'skills',
] as const satisfies readonly PromptSection[];

export type DeferredPromptSection = (typeof DEFERRED_PROMPT_SECTIONS)[number];

export type LoadoutInput = Pick<
    AiAgentArgs,
    | 'execution'
    | 'decisions'
    | 'enableDataAccess'
    | 'enableComposerQueries'
    | 'canRunSql'
    | 'canCreateDashboards'
    | 'enableContentTools'
    | 'enableDocuments'
    | 'enableGenerateDataApp'
    | 'enableAiWriteback'
    | 'enableCodingAgent'
    | 'enableRepoDiscovery'
    | 'enablePreviewDeploySetup'
    | 'enableEditProjectContext'
    | 'enableReadAttachments'
    | 'customSkills'
    | 'projectContextEnabled'
    | 'aiAgentMemoryEnabled'
    | 'requestingUser'
> & {
    /** MCP server tools this run may call, after deep research's raw SQL rule. */
    mcpToolNames: readonly string[];
    attachedMcpServerCount: number;
    customChartTypeCount: number;
};

export type Loadout = {
    base: LoadoutBase;
    addOns: ReadonlySet<AddOnName>;
    toolNames: ReadonlySet<AgentToolName>;
    promptSections: ReadonlySet<PromptSection>;
    skills: ReadonlySet<BuiltInSkillName>;
};

export type BaseDefinition = (input: LoadoutInput) => {
    tools: readonly AgentToolName[];
    sections: readonly PromptSection[];
    skills: readonly BuiltInSkillName[];
    accepts: readonly AddOnName[];
};

export type AddOnDefinition = {
    /** One line, for readers and agents. */
    description: string;
    when: (input: LoadoutInput) => boolean;
    tools: readonly AgentToolName[];
    /** `documents` lists the tools the section explains; the intent gate defers it until one is loaded. */
    section: {
        id: PromptSection;
        documents: readonly AgentToolName[];
    } | null;
    /** Built-in skills that explain this add-on's tools; declaring one brings the `skills` add-on. */
    skills: readonly BuiltInSkillName[];
};
