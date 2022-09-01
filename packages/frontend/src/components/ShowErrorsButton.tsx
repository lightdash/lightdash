import { Button } from '@blueprintjs/core';
import React from 'react';
import styled from 'styled-components';
import { ErrorLogs } from '../providers/ErrorLogsProvider';

const ErrorsButton = styled(Button)`
    margin-right: 20px;
    white-space: nowrap;
    min-width: auto;
`;

export const ShowErrorsButton: React.FC<
    Pick<ErrorLogs, 'errorLogs' | 'setErrorLogsVisible'>
> = ({ errorLogs, setErrorLogsVisible }) => {
    if (errorLogs.length === 0) {
        return null;
    }
    const unreadLogs = errorLogs.filter((log) => log.isUnread);
    if (unreadLogs.length === 0) {
        return (
            <ErrorsButton
                minimal
                icon="application"
                text="Show error logs"
                onClick={() => setErrorLogsVisible(true)}
            />
        );
    }
    return (
        <ErrorsButton
            minimal
            icon="error"
            text={`${unreadLogs.length} ${
                unreadLogs.length === 1 ? 'error' : 'errors'
            }`}
            onClick={() => setErrorLogsVisible(true)}
        />
    );
};
