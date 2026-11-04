import { useNavigate } from 'react-router';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';

export const useAskAurora = (projectUuid: string) => {
    const navigate = useNavigate();
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: true },
    });
    const agent = agents?.[0];
    return (prompt: string | null) =>
        void navigate(
            agent
                ? `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`
                : `/projects/${projectUuid}/ai-agents`,
            prompt ? { state: { autoSubmitPrompt: prompt } } : undefined,
        );
};
