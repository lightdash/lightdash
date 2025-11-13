/* eslint-disable react-refresh/only-export-components */
import type { AiAgentMessageAssistant, AiArtifact } from '@lightdash/common';
import { createContext, useContext, type FC, type ReactNode } from 'react';

type AiArtifactPanelContextType = {
    message?: AiAgentMessageAssistant;
    artifactData?: AiArtifact;
};

const AiArtifactPanelContext = createContext<
    AiArtifactPanelContextType | undefined
>(undefined);

type AiArtifactPanelProviderProps = {
    children: ReactNode;
    value: AiArtifactPanelContextType;
};

export const AiArtifactPanelProvider: FC<AiArtifactPanelProviderProps> = ({
    children,
    value,
}) => {
    return (
        <AiArtifactPanelContext.Provider value={value}>
            {children}
        </AiArtifactPanelContext.Provider>
    );
};

export const useAiArtifactPanelContext = (): AiArtifactPanelContextType => {
    const context = useContext(AiArtifactPanelContext);
    if (context === undefined) {
        throw new Error(
            'useAiArtifactPanelContext must be used within AiArtifactPanelProvider',
        );
    }
    return context;
};
