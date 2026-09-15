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

/** The thread on a full-page thread route, or null elsewhere. */
export const getThreadUuidFromPathname = (pathname: string): string | null =>
    pathname.match(/\/ai-agents\/[^/]+\/threads\/([^/]+)/)?.[1] ?? null;
