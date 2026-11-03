import { useNavigate } from 'react-router';
import { useAgentSuggestions } from '../../aiCopilot/hooks/useAgentSuggestions';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';

export const useFirstQuestions = (projectUuid: string, limit: number) => {
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: true },
    });
    const agent = agents?.[0];
    const { data } = useAgentSuggestions({
        surface: 'home',
        projectUuid,
        agentUuid: agent?.uuid,
        enableSqlMode: agent?.enableSqlMode ?? true,
        enabled: !!agent,
    });
    return (data?.chips ?? [])
        .flatMap((chip) => (chip.kind === 'prompt' ? [chip.label] : []))
        .slice(0, limit);
};

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
