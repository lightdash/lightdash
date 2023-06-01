import { Colors } from '@blueprintjs/core';
import {
    getHumanReadableCronExpression,
    isSlackTarget,
    Scheduler,
    SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Group,
    Loader,
    Table,
    Tabs,
    Title,
    Tooltip,
} from '@mantine/core';
import { User } from '@sentry/react';
import { IconClock, IconHelp, IconPencil, IconSend } from '@tabler/icons-react';
import { FC } from 'react';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import { useTableTabStyles } from '../../hooks/styles/useTableTabStyles';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import Schedulers from './Schedulers';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SchedulerContent: FC<{ scheduler: Scheduler; projectUuid: string }> = ({
    scheduler,
    projectUuid,
}) => {
    return scheduler.dashboardUuid !== null ? (
        <Anchor
            href={`/projects/${projectUuid}/dashboards/${scheduler?.dashboardUuid}/view`}
            target="_blank"
        >
            View dashboard
        </Anchor>
    ) : (
        <Anchor
            href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
            target="_blank"
        >
            View chart
        </Anchor>
    );
};
const SchedulerDetails: FC<{ scheduler: SchedulerAndTargets; user?: User }> = ({
    scheduler,
    user,
}) => {
    return (
        <Tooltip
            position="right"
            multiline
            label={
                <>
                    <p>
                        Created by: {user?.firstName} {user?.lastName}
                    </p>
                    <p>Type: {scheduler.format}</p>
                    <p>
                        Sent to:{' '}
                        <ul>
                            {scheduler.targets.map((s, index) => (
                                <li key={index}>
                                    {isSlackTarget(s) ? s.channel : s.recipient}
                                </li>
                            ))}
                        </ul>
                    </p>
                </>
            }
        >
            <IconHelp
                size={20}
                color={Colors.GRAY4}
                style={{ marginBottom: -5 }}
            />
        </Tooltip>
    );
};

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const tableTabStyles = useTableTabStyles();

    const { data, isLoading } = useSchedulerLogs(projectUuid);
    const formatTime = (date: Date) => {
        return new Date(date).toLocaleString('en-US', {
            timeZone: 'UTC',
            dateStyle: 'short',
            timeStyle: 'short',
        });
    };
    const renderStatusBadge = (
        status: string,
        details?: Record<string, any | undefined>,
    ) => {
        switch (status) {
            case 'scheduled': {
                return (
                    <Badge color="indigo" my="xs">
                        Scheduled
                    </Badge>
                );
            }
            case 'started': {
                return <Badge my="xs">Started</Badge>;
            }
            case 'completed': {
                return (
                    <Badge color="green" my="xs">
                        Completed
                    </Badge>
                );
            }
            case 'error': {
                return (
                    <Tooltip label={details?.error || ''}>
                        <Badge color="red" my="xs">
                            Error
                        </Badge>
                    </Tooltip>
                );
            }
            case 'no status': {
                return (
                    <Badge color="gray" my="xs">
                        Status unavailable
                    </Badge>
                );
            }
        }
    };

    return (
        <SettingsCard style={{ overflow: 'visible' }} p={0} shadow="none">
            <Tabs
                classNames={tableTabStyles.classes}
                keepMounted={false}
                defaultValue="scheduled-deliveries"
                mb="sm"
            >
                <Tabs.List>
                    <Tabs.Tab
                        value="scheduled-deliveries"
                        icon={<MantineIcon icon={IconSend} size={14} />}
                    >
                        <Title order={6} fw={500}>
                            All schedulers
                        </Title>
                    </Tabs.Tab>
                    <Tabs.Tab
                        value="run-history"
                        icon={<MantineIcon icon={IconClock} size={14} />}
                    >
                        <Title order={6} fw={500}>
                            Run history
                        </Title>
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="scheduled-deliveries">
                    <Schedulers {...data} />
                </Tabs.Panel>

                <Tabs.Panel value="run-history">table 2</Tabs.Panel>
            </Tabs>
        </SettingsCard>
    );
};

export default SettingsScheduledDeliveries;
