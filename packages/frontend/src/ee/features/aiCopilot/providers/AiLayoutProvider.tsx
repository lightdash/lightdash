import { createContext, useContext } from 'react';

export interface AiAgentPageLayoutContextType {
    collapseSidebar: () => void;
    expandSidebar: () => void;
    toggleSidebar: () => void;
    isSidebarCollapsed: boolean;
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
