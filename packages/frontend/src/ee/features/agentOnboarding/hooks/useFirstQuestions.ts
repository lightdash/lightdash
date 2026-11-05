import { useNavigate } from 'react-router';
import { useCanCreateAiAgentThread } from '../../aiCopilot/hooks/useAiAgentPermission';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';

export const useAskAurora = (projectUuid: string) => {
    const navigate = useNavigate();
    const canCreateThread = useCanCreateAiAgentThread(projectUuid);
    const { data: agents, isInitialLoading } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: canCreateThread },
    });
    const agent = agents?.[0];
    return {
        canAsk: canCreateThread && (isInitialLoading || !!agent),
        ask: (prompt: string | null) =>
            void navigate(
                agent
                    ? `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`
                    : `/projects/${projectUuid}/ai-agents`,
                prompt ? { state: { autoSubmitPrompt: prompt } } : undefined,
            ),
    };
};
