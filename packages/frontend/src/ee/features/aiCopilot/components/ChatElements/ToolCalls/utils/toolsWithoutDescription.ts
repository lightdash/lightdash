import { type ToolName } from '@lightdash/common';

// Tools that render no description; their rows get no chevron or expand body.
const TOOLS_WITHOUT_DESCRIPTION = [
    'listKnowledgeDocuments',
    'listProjects',
    'getProjectInfo',
    'generateHashes',
    'generateUuids',
    'loadProjectContext',
    'discoverRepos',
    'listWorkstreams',
    'closePullRequest',
    'getPullRequestDiff',
    'generateDataApp',
    'iterateDataApp',
    'listDataAppThemes',
    'listDataAppConnections',
    'editDbtProject',
    'editProjectContext',
    'editRepo',
    'updateUserName',
    'syncDbtProject',
    'runSavedChart',
    'readPinnedThread',
    'readAttachments',
    'submitResearchReport',
    'delegateResearchTask',
    'submitWorkerFindings',
    'loadMcpTools',
    'resolveUrl',
    'findCustomChartTypes',
    'visualize',
] as const satisfies readonly ToolName[];

type ToolWithoutDescription = (typeof TOOLS_WITHOUT_DESCRIPTION)[number];

export const isToolWithoutDescription = (
    toolName: ToolName,
): toolName is ToolWithoutDescription =>
    (TOOLS_WITHOUT_DESCRIPTION as readonly ToolName[]).includes(toolName);
