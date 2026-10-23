import useHealth from '../../../../hooks/health/useHealth';

// Raw "copilot available" signal. Unlike useAiAgentButtonVisibility this does
// not require agents to already exist, so an org with no agents still counts.
export const useIsCopilotEnabled = () => {
    const healthQuery = useHealth();

    return {
        isCopilotEnabled: !!healthQuery.data?.ai.isCopilotAvailable,
        isLoading: healthQuery.isInitialLoading,
    };
};
