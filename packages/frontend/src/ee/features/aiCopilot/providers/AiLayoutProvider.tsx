import { type AiAgentMessageAssistant } from '@lightdash/common';
import { createContext, useContext } from 'react';

export interface ArtifactData {
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
}

export interface AiAgentPageLayoutContextType {
    collapseSidebar: () => void;
    expandSidebar: () => void;
    toggleSidebar: () => void;
    isSidebarCollapsed: boolean;
    collapseArtifact: () => void;
    expandArtifact: () => void;
    clearArtifact: () => void;
    artifact: ArtifactData | null;
    setArtifact: (
        artifactUuid: string,
        versionUuid: string,
        message: AiAgentMessageAssistant,
        messageProjectUuid: string,
        messageAgentUuid: string,
    ) => void;
}

export const AiAgentPageLayoutContext =
    createContext<AiAgentPageLayoutContextType | null>(null);

export const useAiAgentPageLayout = () => {
    const context = useContext(AiAgentPageLayoutContext);
    if (!context) {
        throw new Error(
            'useAiAgentPageLayout must be used within an AiAgentPageLayoutProvider',
        );
    }
    return context;
};
