import { createContext, useContext } from 'react';

export const AiAgentThreadStreamAbortControllerContext = createContext<{
    getAbortController: (threadId: string) => AbortController | undefined;
    setAbortController: (
        threadId: string,
        abortController: AbortController,
    ) => void;
    abort: (threadId: string) => void;
} | null>(null);

export const useAiAgentThreadStreamAbortController = () => {
    const context = useContext(AiAgentThreadStreamAbortControllerContext);
    if (!context) {
        throw new Error(
            'useAiAgentThreadStreamAbortController must be used within a AiAgentThreadStreamAbortControllerProvider',
        );
    }
    return context;
};
