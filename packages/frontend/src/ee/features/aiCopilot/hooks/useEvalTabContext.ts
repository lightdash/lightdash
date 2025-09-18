import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export type EvalTabContextType = {
    selectedThreadUuid: string | null;
    setSelectedThreadUuid: (threadUuid: string | null) => void;
    clearThread: () => void;
    isSidebarOpen: boolean;
};

export const useEvalTabContext = (): EvalTabContextType => {
    const [searchParams, setSearchParams] = useSearchParams();

    const selectedThreadUuid = searchParams.get('evalThreadUuid');

    const setSelectedThreadUuid = useCallback(
        (threadUuid: string | null) => {
            setSearchParams((prev) => {
                const newParams = new URLSearchParams(prev);
                if (threadUuid) {
                    newParams.set('evalThreadUuid', threadUuid);
                } else {
                    newParams.delete('evalThreadUuid');
                }
                return newParams;
            });
        },
        [setSearchParams],
    );

    const clearThread = useCallback(() => {
        setSelectedThreadUuid(null);
    }, [setSelectedThreadUuid]);

    const isSidebarOpen = selectedThreadUuid !== null;

    return useMemo(
        () => ({
            selectedThreadUuid,
            setSelectedThreadUuid,
            clearThread,
            isSidebarOpen,
        }),
        [selectedThreadUuid, setSelectedThreadUuid, clearThread, isSidebarOpen],
    );
};
