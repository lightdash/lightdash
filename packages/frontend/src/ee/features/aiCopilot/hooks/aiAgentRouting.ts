export const isEmbedAiAgentRoute = () =>
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/embed/');

export const getAiAgentApiBase = (projectUuid: string) =>
    `/projects/${projectUuid}/aiAgents`;

export const getAiAgentPageBase = (projectUuid: string) =>
    isEmbedAiAgentRoute()
        ? `/embed/${projectUuid}/ai-agents`
        : `/projects/${projectUuid}/ai-agents`;

export const getAiAgentThreadPath = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) => `${getAiAgentPageBase(projectUuid)}/${agentUuid}/threads/${threadUuid}`;

/** Where an embedded AI agent opens a saved dashboard it references. */
export const getEmbedAiAgentDashboardPath = (
    projectUuid: string,
    agentUuid: string,
    dashboardUuid: string,
) => `/embed/${projectUuid}/ai-agents/${agentUuid}/dashboards/${dashboardUuid}`;

/** The thread on a full-page thread route, or null elsewhere. */
export const getThreadUuidFromPathname = (pathname: string): string | null =>
    pathname.match(/\/ai-agents\/[^/]+\/threads\/([^/]+)/)?.[1] ?? null;
