import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import useToaster from '../hooks/toaster/useToaster';

const MAX_LOG_ENTRIES = 50;

export interface ErrorLogEntry {
    title: string;
    body?: string;
    timestamp: Date;
}

export interface ErrorLogs {
    errorLogs: ErrorLogEntry[];
    appendError: (entry: Pick<ErrorLogEntry, 'title' | 'body'>) => void;
    deleteError: (idx: number) => void;
}

const Context = createContext<ErrorLogs>(undefined as any);

export const ErrorLogsProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
    const { showToastError } = useToaster();

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

    const appendError = useCallback<ErrorLogs['appendError']>(
        ({ title, body }) => {
            appendErrorLogEntry({
                title,
                body,
                timestamp: new Date(),
            });
        },
        [appendErrorLogEntry],
    );

    const deleteError = useCallback<(idx: number) => void>(
        (idx) => {
            setErrorLogs((logs) => [
                ...logs.slice(0, idx),
                ...logs.slice(idx + 1),
            ]);
        },
        [setErrorLogs],
    );

    const value = {
        errorLogs,
        appendError,
        deleteError,
    };

    useEffect(() => {
        if (errorLogs.length > 0) {
            errorLogs.map((errorLog) => {
                showToastError({
                    title: errorLog.title,
                    subtitle: errorLog.body,
                    key: errorLog.timestamp.toString(),
                    onClose: () => deleteError(errorLogs.indexOf(errorLog)),
                });
            });
        }
    }, [showToastError, errorLogs, deleteError]);

    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useErrorLogs(): ErrorLogs {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useErrorLogsContext must be used within a ErrorLogsProvider',
        );
    }
    return context;
}
