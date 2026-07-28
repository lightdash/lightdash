import { useAiAgentVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';

type HomepageAiState = {
    /** The homepage should surface its Ask AI blocks. */
    isAiEnabled: boolean;
    isLoading: boolean;
};

/**
 * Stricter than `useAiAgentButtonVisibility`, which is also true for anyone who
 * can *manage* agents when none exist — good enough for a nav button, but on the
 * homepage that turns the hero into an empty composer nudging admins to go set
 * an agent up. Here an agent has to actually be configured.
 */
export const useHomepageAiState = (): HomepageAiState => {
    const { isVisible, hasAgents, isLoading } = useAiAgentVisibility();
    return { isAiEnabled: isVisible && hasAgents, isLoading };
};

export const useHomepageAiEnabled = (): boolean =>
    useHomepageAiState().isAiEnabled;
