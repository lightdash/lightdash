import { IconExclamationCircle, IconTerminal2 } from '@tabler/icons-react';
import React from 'react';

import { Button } from '@mantine/core';
import { ErrorLogs } from '../providers/ErrorLogsProvider';
import MantineIcon from './common/MantineIcon';

type Props = Pick<ErrorLogs, 'errorLogs' | 'setErrorLogsVisible'>;

export const ShowErrorsButton: React.FC<Props> = ({
    errorLogs,
    setErrorLogsVisible,
}) => {
    if (errorLogs.length === 0) return null;

    const unreadLogs = errorLogs.filter((log) => log.isUnread);

    return unreadLogs.length === 0 ? (
        <Button
            color="gray"
            variant="light"
            size="xs"
            fz="sm"
            leftIcon={<MantineIcon icon={IconTerminal2} />}
            onClick={() => setErrorLogsVisible(true)}
        >
            Show error logs
        </Button>
    ) : (
        <Button
            color="gray"
            variant="light"
            size="xs"
            fz="sm"
            leftIcon={<MantineIcon icon={IconExclamationCircle} />}
            onClick={() => setErrorLogsVisible(true)}
        >
            {unreadLogs.length} {unreadLogs.length === 1 ? 'error' : 'errors'}
        </Button>
    );
};
