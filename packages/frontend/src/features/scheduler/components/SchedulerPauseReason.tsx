import { type Scheduler } from '@lightdash/common';
import { Alert, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    scheduler:
        | Pick<Scheduler, 'enabled' | 'automaticallyDisabledReason'>
        | undefined;
};

export const SchedulerPauseReason: FC<Props> = ({ scheduler }) =>
    scheduler && !scheduler.enabled && scheduler.automaticallyDisabledReason ? (
        <Alert
            color="orange"
            title="Automatically paused"
            icon={<MantineIcon icon={IconAlertTriangle} />}
        >
            <Text size="sm">{scheduler.automaticallyDisabledReason}</Text>
            <Text size="sm" mt="xs">
                Once you’ve fixed the issue, turn the schedule back on to resume
                deliveries.
            </Text>
        </Alert>
    ) : null;
