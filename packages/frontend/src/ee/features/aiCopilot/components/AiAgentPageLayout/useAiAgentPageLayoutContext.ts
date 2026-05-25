import { createContext, useContext } from 'react';

type AiAgentPageLayoutContextValue = {
    collapseSidebar: () => void;
};

const AiAgentPageLayoutContext =
    createContext<AiAgentPageLayoutContextValue | null>(null);

export const AiAgentPageLayoutContextProvider =
    AiAgentPageLayoutContext.Provider;

export const useAiAgentPageLayoutContext = () =>
    useContext(AiAgentPageLayoutContext);
