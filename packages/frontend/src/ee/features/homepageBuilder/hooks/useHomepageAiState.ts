import { useAiAgentButtonVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useIsCopilotEnabled } from '../../aiCopilot/hooks/useIsCopilotEnabled';
import { useProjectAiAgents } from '../../aiCopilot/hooks/useProjectAiAgents';

/**
 * Whether the homepage should lead with Ask AI. `useAiAgentButtonVisibility`
 * alone isn't enough: it stays true for admins of an agent-less project so
 * they can go create one, which would leave day-0 fronted by a composer that
 * can't answer anything.
 */
export const useHomepageAiState = (projectUuid: string) => {
    const isAiVisible = useAiAgentButtonVisibility();
    const { isCopilotEnabled, isLoading: isCopilotLoading } =
        useIsCopilotEnabled();
    const agentsQuery = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: isCopilotEnabled },
    });

    const hasAgents = (agentsQuery.data?.length ?? 0) > 0;

    return {
        isLoading: isCopilotLoading || agentsQuery.isInitialLoading,
        canAskAi: isAiVisible && hasAgents,
    };
};
