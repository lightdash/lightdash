import React from 'react';
import { Button } from '@blueprintjs/core';
import { ErrorLogs } from '../hooks/useErrorLogs';

export const ShowErrorsButton: React.FC<
    Pick<ErrorLogs, 'errorLogs' | 'setErrorLogsVisible'>
> = ({ errorLogs, setErrorLogsVisible }) => {
    if (errorLogs.length === 0) {
        return null;
    }
    const unreadLogs = errorLogs.filter((log) => log.isUnread);
    if (unreadLogs.length === 0) {
        return (
            <Button
                style={{ marginRight: 20 }}
                minimal
                icon="application"
                text="Show error logs"
                onClick={() => setErrorLogsVisible(true)}
            />
        );
    }
    return (
        <Button
            style={{ marginRight: 20 }}
            minimal
            icon="error"
            text={`${unreadLogs.length} ${
                unreadLogs.length === 1 ? 'error' : 'errors'
            }`}
            onClick={() => setErrorLogsVisible(true)}
        />
    );
};
