import {
    getHumanReadableCronExpression,
    isSlackTarget,
    SchedulerJobStatus,
    SchedulerWithLogs,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    MantineTheme,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconClockFilled,
    IconCsv,
    IconPhoto,
    IconProgress,
} from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceIcon';
import SchedulersViewActionMenu from './SchedulersViewActionMenu';

export type SchedulerItem = SchedulerWithLogs['schedulers'][number];
export type Log = SchedulerWithLogs['logs'][number];

type ColumnName =
    | 'name'
    | 'destinations'
    | 'frequency'
    | 'lastDelivery'
    | 'actions'
    | 'jobs'
    | 'deliveryScheduled'
    | 'deliveryStarted'
    | 'status';

type SchedulersProps = {
    projectUuid: string;
    schedulers: SchedulerWithLogs['schedulers'];
    logs: SchedulerWithLogs['logs'];
    users: SchedulerWithLogs['users'];
    charts: SchedulerWithLogs['charts'];
    dashboards: SchedulerWithLogs['dashboards'];
};

export interface Column {
    id: ColumnName;
    label?: string;
    cell: (item: SchedulerItem) => React.ReactNode;
    meta?: {
        style: React.CSSProperties;
    };
}

export const getSchedulerIcon = (item: SchedulerItem, theme: MantineTheme) => {
    switch (item.format) {
        case 'csv':
            return (
                <IconBox
                    icon={IconCsv}
                    color="indigo.6"
                    style={{ color: theme.colors.indigo[6] }}
                />
            );
        case 'image':
            return (
                <IconBox
                    icon={IconPhoto}
                    color="indigo.6"
                    style={{ color: theme.colors.indigo[6] }}
                />
            );
    }
};

export const getLogStatusIcon = (log: Log, theme: MantineTheme) => {
    switch (log.status) {
        case SchedulerJobStatus.SCHEDULED:
            return (
                <Tooltip label={SchedulerJobStatus.SCHEDULED}>
                    <MantineIcon
                        icon={IconClockFilled}
                        color="blue.3"
                        style={{ color: theme.colors.blue[3] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.STARTED:
            return (
                <Tooltip label={SchedulerJobStatus.STARTED}>
                    <MantineIcon
                        icon={IconProgress}
                        color="yellow.6"
                        style={{ color: theme.colors.yellow[6] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.COMPLETED:
            return (
                <Tooltip label={SchedulerJobStatus.COMPLETED}>
                    <MantineIcon
                        icon={IconCircleCheckFilled}
                        color="green.6"
                        style={{ color: theme.colors.green[6] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.ERROR:
            return (
                <Tooltip label={log?.details?.error}>
                    <MantineIcon
                        icon={IconAlertTriangleFilled}
                        color="red.6"
                        style={{ color: theme.colors.red[6] }}
                    />
                </Tooltip>
            );
    }
};

export const getSchedulerLink = (item: SchedulerItem, projectUuid: string) => {
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${item.savedChartUuid}/view/?scheduler_uuid=${item.schedulerUuid}`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view/?scheduler_uuid=${item.schedulerUuid}`;
};
export const getItemLink = (item: SchedulerItem, projectUuid: string) => {
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${item.savedChartUuid}/view`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view`;
};

export const formatTime = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
        timeZone: 'UTC',
        dateStyle: 'short',
        timeStyle: 'short',
    });
};

const Schedulers: FC<SchedulersProps> = ({
    projectUuid,
    schedulers,
    logs,
    users,
    charts,
    dashboards,
}) => {
    const { classes, theme } = useTableStyles();

    const columns = useMemo<Column[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                cell: (item) => {
                    const user = users.find(
                        (u) => u.userUuid === item.createdBy,
                    );
                    const chartOrDashboard = item.savedChartUuid
                        ? charts.find(
                              (chart) =>
                                  chart.savedChartUuid === item.savedChartUuid,
                          )
                        : dashboards.find(
                              (dashboard) =>
                                  dashboard.dashboardUuid ===
                                  item.dashboardUuid,
                          );
                    return (
                        <Anchor
                            sx={{
                                color: 'unset',
                                ':hover': {
                                    color: 'unset',
                                    textDecoration: 'none',
                                },
                            }}
                            href={getSchedulerLink(item, projectUuid)}
                            target="_blank"
                        >
                            <Group noWrap>
                                {getSchedulerIcon(item, theme)}
                                <Stack spacing="two">
                                    <Tooltip
                                        label={
                                            <Stack spacing="two">
                                                <Text fz={12} color="gray.5">
                                                    Schedule type:{' '}
                                                    <Text color="white" span>
                                                        {item.format === 'csv'
                                                            ? 'CSV'
                                                            : 'Image'}
                                                    </Text>
                                                </Text>
                                                <Text fz={12} color="gray.5">
                                                    Created by:{' '}
                                                    <Text color="white" span>
                                                        {user?.firstName}{' '}
                                                        {user?.lastName}
                                                    </Text>
                                                </Text>
                                            </Stack>
                                        }
                                    >
                                        <Text
                                            fw={600}
                                            lineClamp={1}
                                            sx={{
                                                overflowWrap: 'anywhere',
                                                '&:hover': {
                                                    textDecoration: 'underline',
                                                },
                                            }}
                                        >
                                            {item.name}
                                        </Text>
                                    </Tooltip>
                                    <Text fz={12} color="gray.6">
                                        {chartOrDashboard?.name}
                                    </Text>
                                </Stack>
                            </Group>
                        </Anchor>
                    );
                },
                meta: {
                    style: {
                        width: 300,
                    },
                },
            },
            {
                id: 'destinations',
                label: 'Destinations',
                cell: (item) => {
                    const currentTargets = item.targets.filter(
                        (target) => target.schedulerUuid === item.schedulerUuid,
                    );
                    let emails: string[] = [];
                    let slackChannels: string[] = [];
                    currentTargets.map((t) =>
                        isSlackTarget(t)
                            ? slackChannels.push(t.channel)
                            : emails.push(t.recipient),
                    );
                    return (
                        <Group spacing="xxs">
                            {emails.length > 0 && (
                                <Tooltip
                                    label={emails.map((email, i) => (
                                        <Text fz={12} key={i}>
                                            {email}
                                        </Text>
                                    ))}
                                >
                                    <Text fz={12} color="gray.6" underline>
                                        {slackChannels.length > 0
                                            ? 'Email,'
                                            : 'Email'}
                                    </Text>
                                </Tooltip>
                            )}
                            {slackChannels.length > 0 && (
                                <Tooltip
                                    label={slackChannels.map((channel, i) => (
                                        <Text fz={12} key={i}>
                                            {channel}
                                        </Text>
                                    ))}
                                >
                                    <Text fz={12} color="gray.6" underline>
                                        Slack
                                    </Text>
                                </Tooltip>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'frequency',
                label: 'Frequency',
                cell: (item) => {
                    return (
                        <Text fz={12} color="gray.6">
                            {getHumanReadableCronExpression(item.cron)}
                        </Text>
                    );
                },
                meta: { style: { width: 200 } },
            },
            {
                id: 'lastDelivery',
                label: 'Last delivery start',
                cell: (item) => {
                    const currentLogs = logs.filter(
                        (log) => log.schedulerUuid === item.schedulerUuid,
                    );
                    return currentLogs.length > 0 ? (
                        <Group spacing="xs">
                            <Text fz={12} color="gray.6">
                                {formatTime(currentLogs[0].createdAt)}
                            </Text>
                            {getLogStatusIcon(currentLogs[0], theme)}
                        </Group>
                    ) : (
                        <Text fz={12} color="gray.6">
                            No deliveries started
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                cell: (item) => {
                    return (
                        <Box
                            component="div"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <SchedulersViewActionMenu
                                item={item}
                                projectUuid={projectUuid}
                            />
                        </Box>
                    );
                },
                meta: {
                    style: { width: '1px' },
                },
            },
        ],
        [users, charts, dashboards, projectUuid, logs, theme],
    );

    return (
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {columns.map((column) => {
                        return (
                            <Box
                                component="th"
                                key={column.id}
                                style={column?.meta?.style}
                            >
                                {column?.label}
                            </Box>
                        );
                    })}
                </tr>
            </thead>

            <tbody>
                {schedulers.map((item) => (
                    <tr key={item.schedulerUuid}>
                        {columns.map((column) => (
                            <td key={column.id}>{column.cell(item)}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default Schedulers;
