import { createContext, useContext } from 'react';

interface PendingPrompt {
    prompt: string;
    branch: string;
}

export interface AgentCodingContextValue {
    isDrawerOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
    openDrawerWithPrompt: (prompt: string, branch?: string) => void;
}

export interface AgentCodingProviderState {
    pendingPrompt: PendingPrompt | null;
}

export const AgentCodingContext = createContext<AgentCodingContextValue | null>(null);

export const useAgentCodingContext = () => {
    const context = useContext(AgentCodingContext);
    if (!context) {
        throw new Error('useAgentCodingContext must be used within AgentCodingProvider');
    }
    return context;
};

/**
 * Safe version of useAgentCodingContext that returns null if not in provider
 * Use this in places where the provider might not be mounted
 */
export const useAgentCodingContextSafe = () => {
    return useContext(AgentCodingContext);
};
