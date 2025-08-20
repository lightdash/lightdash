import { createContext, useContext, type ReactNode } from 'react';

export interface AiAgentPageLayoutContextType {
    collapseSidebar: () => void;
    expandSidebar: () => void;
    toggleSidebar: () => void;
    isSidebarCollapsed: boolean;
    collapseArtifact: () => void;
    expandArtifact: () => void;
    artifact: ReactNode;
    setArtifact: (artifact: ReactNode) => void;
}

export const AiAgentPageLayoutContext =
    createContext<AiAgentPageLayoutContextType | null>(null);

export const useAiAgentPageLayout = () => {
    const context = useContext(AiAgentPageLayoutContext);
    if (!context) {
        throw new Error(
            'useAiAgentPageLayout must be used within AiAgentPageLayoutProvider',
        );
    }
    return context;
};
