import { useCallback, useRef } from 'react';
import { AiAgentThreadStreamAbortControllerContext } from './AiAgentThreadStreamAbortControllerContext';

export const AiAgentThreadStreamAbortControllerContextProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

    const getAbortController = useCallback((threadId: string) => {
        return abortControllersRef.current.get(threadId);
    }, []);

    const setAbortController = useCallback(
        (threadId: string, abortController: AbortController) => {
            abortControllersRef.current.get(threadId)?.abort();
            abortControllersRef.current.set(threadId, abortController);
        },
        [],
    );

    const abort = useCallback((threadId: string) => {
        abortControllersRef.current.get(threadId)?.abort();
        abortControllersRef.current.delete(threadId);
    }, []);

    return (
        <AiAgentThreadStreamAbortControllerContext.Provider
            value={{ getAbortController, setAbortController, abort }}
        >
            {children}
        </AiAgentThreadStreamAbortControllerContext.Provider>
    );
};
