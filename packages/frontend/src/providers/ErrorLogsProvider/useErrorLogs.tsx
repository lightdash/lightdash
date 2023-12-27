import { useContext } from 'react';
import { Context, ErrorLogs } from '.';

export function useErrorLogs(): ErrorLogs {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useErrorLogsContext must be used within a ErrorLogsProvider',
        );
    }
    return context;
}
