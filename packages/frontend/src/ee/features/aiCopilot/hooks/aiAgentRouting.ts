export const isEmbedAiAgentRoute = () =>
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/embed/');

export const getAiAgentApiBase = (projectUuid: string) =>
    `/projects/${projectUuid}/aiAgents`;

export const getAiAgentPageBase = (projectUuid: string) =>
    isEmbedAiAgentRoute()
        ? `/embed/${projectUuid}/ai-agents`
        : `/projects/${projectUuid}/ai-agents`;
