import { useCallback, useState } from 'react';

const MAX_LOG_ENTRIES = 50;

export interface ErrorLogEntry {
    title: string;
    body?: string;
    timestamp: Date;
    isUnread: boolean;
}

export interface ErrorLogs {
    errorLogs: ErrorLogEntry[];
    errorLogsVisible: boolean;
    setErrorLogsVisible: (visible: boolean) => void;
    showError: (entry: Pick<ErrorLogEntry, 'title' | 'body'>) => void;
    setAllLogsRead: () => void;
    deleteErrorLogEntry: (idx: number) => void;
}

export const useErrorLogs = (): ErrorLogs => {
    const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
    const [errorLogsVisible, setErrorLogsVisible] = useState<boolean>(false);

    const setAllLogsRead = useCallback(() => {
        setErrorLogs((logs) =>
            logs.map((log) => ({ ...log, isUnread: false })),
        );
    }, [setErrorLogs]);

    const deleteErrorLogEntry = useCallback<(idx: number) => void>(
        (idx) => {
            setErrorLogs((logs) => [
                ...logs.slice(0, idx),
                ...logs.slice(idx + 1),
            ]);
        },
        [setErrorLogs],
    );

    const appendErrorLogEntry = useCallback<(errorLog: ErrorLogEntry) => void>(
        (errorLog: ErrorLogEntry) => {
            setErrorLogs((logs) => {
                const latest = logs[logs.length - 1];
                // If the error message text is identical, just update the metadata
                if (
                    latest?.body === errorLog.body &&
                    latest?.title === errorLog.title
                ) {
                    return [...logs.slice(0, -1), errorLog];
                }
                return [...logs.slice(-MAX_LOG_ENTRIES), errorLog];
            });
        },
        [setErrorLogs],
    );

    const showError = useCallback<ErrorLogs['showError']>(
        ({ title, body }) => {
            appendErrorLogEntry({
                title,
                body,
                timestamp: new Date(),
                isUnread: true,
            });
            setErrorLogsVisible(true);
        },
        [setErrorLogsVisible, appendErrorLogEntry],
    );
    return {
        errorLogs,
        errorLogsVisible,
        setErrorLogsVisible,
        showError,
        setAllLogsRead,
        deleteErrorLogEntry,
    };
};
