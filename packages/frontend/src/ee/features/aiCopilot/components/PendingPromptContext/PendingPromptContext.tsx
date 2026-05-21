import {
    createContext,
    useContext,
    useMemo,
    useState,
    type FC,
    type ReactNode,
} from 'react';

/**
 * Holds an in-progress new-thread prompt above `AgentPage` so it survives
 * the page remount triggered by switching agents.
 */

type PendingPromptContextValue = {
    pendingPrompt: string;
    setPendingPrompt: (prompt: string) => void;
};

const PendingPromptContext = createContext<PendingPromptContextValue | null>(
    null,
);

export const PendingPromptProvider: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const [pendingPrompt, setPendingPrompt] = useState('');
    const value = useMemo(
        () => ({ pendingPrompt, setPendingPrompt }),
        [pendingPrompt],
    );
    return (
        <PendingPromptContext.Provider value={value}>
            {children}
        </PendingPromptContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePendingPrompt = (): PendingPromptContextValue => {
    const ctx = useContext(PendingPromptContext);
    if (!ctx) {
        throw new Error(
            'usePendingPrompt must be used within a PendingPromptProvider',
        );
    }
    return ctx;
};
