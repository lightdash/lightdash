type AgentSuggestionModeArgs = {
    disabled: boolean;
    isArtifactPanelOpen: boolean;
    isMinimalMode: boolean;
    loading: boolean;
    messageCount: number;
    latestAssistantMessageUuid?: string;
    suggestionsEnabled: boolean;
    threadUuid?: string;
};

export const getAgentSuggestionModes = ({
    disabled,
    isArtifactPanelOpen,
    isMinimalMode,
    loading,
    messageCount,
    latestAssistantMessageUuid,
    suggestionsEnabled,
    threadUuid,
}: AgentSuggestionModeArgs) => {
    const canFetchSuggestions = !disabled && suggestionsEnabled;

    return {
        emptyStateMode:
            !isMinimalMode && messageCount === 0 && canFetchSuggestions,
        postResponseMode:
            messageCount > 0 &&
            !loading &&
            !!threadUuid &&
            !!latestAssistantMessageUuid &&
            !isArtifactPanelOpen &&
            canFetchSuggestions,
    };
};
