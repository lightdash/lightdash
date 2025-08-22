import { createContext, useContext, type ReactNode } from 'react';

export interface ArtifactWithId {
    id: string;
    content: ReactNode;
}

export interface AiAgentPageLayoutContextType {
    collapseSidebar: () => void;
    expandSidebar: () => void;
    toggleSidebar: () => void;
    isSidebarCollapsed: boolean;
    collapseArtifact: () => void;
    expandArtifact: () => void;
    clearArtifact: () => void;
    artifact: ArtifactWithId | null;
    setArtifact: (artifact: ReactNode, id: string) => void;
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
