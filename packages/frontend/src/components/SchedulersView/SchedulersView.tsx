import {
    getHumanReadableCronExpression,
    isSchedulerGsheetsOptions,
    isSlackTarget,
    SchedulerFormat,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useGetSlack, useSlackChannels } from '../../hooks/slack/useSlack';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import SchedulersViewActionMenu from './SchedulersViewActionMenu';
import {
    formatTime,
    getLogStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
    type SchedulerColumnName,
    type SchedulerItem,
} from './SchedulersViewUtils';

interface SchedulersProps
    extends Pick<
        SchedulerWithLogs,
        'schedulers' | 'logs' | 'users' | 'charts' | 'dashboards'
    > {
    projectUuid: string;
}

type Column = {
    id: SchedulerColumnName;
    label?: string;
    cell: (item: SchedulerItem) => React.ReactNode;
    meta?: {
        style: React.CSSProperties;
    };
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
    const { data } = useGetSlack();
    const { data: allSlackChannels } = useSlackChannels({
        enabled: !!data?.isSlackInstalled,
    });

    const getSlackChannelName = useCallback(
        (channelId: string) => {
            if (allSlackChannels === undefined || allSlackChannels.length === 0)
                return channelId;
            const channelName = allSlackChannels.find(
                (slackChannel) => slackChannel.id === channelId,
            )?.name;
            return channelName || channelId;
        },
        [allSlackChannels],
    );

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
                    const format = () => {
                        switch (item.format) {
                            case SchedulerFormat.CSV:
                                return 'CSV';
                            case SchedulerFormat.IMAGE:
                                return 'Image';
                            case SchedulerFormat.GSHEETS:
                                return 'Google Sheets';
                        }
                    };
                    return (
                        <Group noWrap>
                            {getSchedulerIcon(item, theme)}
                            <Stack spacing="two">
                                <Anchor
                                    component={Link}
                                    unstyled
                                    to={getSchedulerLink(item, projectUuid)}
                                    target="_blank"
                                >
                                    <Tooltip
                                        label={
                                            <Stack spacing="two" fz="xs">
                                                <Text color="gray.5">
                                                    Schedule type:{' '}
                                                    <Text color="white" span>
                                                        {format()}
                                                    </Text>
                                                </Text>
                                                <Text color="gray.5">
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
                                </Anchor>
                                <Text fz="xs" color="gray.6">
                                    {chartOrDashboard?.name}
                                </Text>
                            </Stack>
                        </Group>
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
                    currentTargets.map((t) => {
                        if (isSlackTarget(t)) {
                            return slackChannels.push(
                                getSlackChannelName(t.channel),
                            );
                        } else {
                            return emails.push(t.recipient);
                        }
                    });
                    return (
                        <Group spacing="xxs">
                            {emails.length > 0 && (
                                <Tooltip
                                    label={emails.map((email, i) => (
                                        <Text fz="xs" key={i}>
                                            {email}
                                        </Text>
                                    ))}
                                >
                                    <Text fz="xs" color="gray.6" underline>
                                        {slackChannels.length > 0
                                            ? 'Email,'
                                            : 'Email'}
                                    </Text>
                                </Tooltip>
                            )}
                            {slackChannels.length > 0 && (
                                <Tooltip
                                    label={slackChannels.map((channel, i) => (
                                        <Text fz="xs" key={i}>
                                            {channel}
                                        </Text>
                                    ))}
                                >
                                    <Text fz="xs" color="gray.6" underline>
                                        Slack
                                    </Text>
                                </Tooltip>
                            )}
                            {item.format === SchedulerFormat.GSHEETS &&
                                isSchedulerGsheetsOptions(item.options) && (
                                    <Tooltip label={item.options.gdriveName}>
                                        <Anchor
                                            fz="xs"
                                            color="gray.6"
                                            href={item.options.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            sx={{
                                                textDecoration: 'underline',
                                            }}
                                        >
                                            Google Sheets
                                        </Anchor>
                                    </Tooltip>
                                )}
                            {item.format !== SchedulerFormat.GSHEETS &&
                                slackChannels.length === 0 &&
                                emails.length === 0 && (
                                    <Text fz="xs" color="gray.6">
                                        No destinations
                                    </Text>
                                )}
                        </Group>
                    );
                },
                meta: {
                    style: {
                        width: 130,
                    },
                },
            },
            {
                id: 'frequency',
                label: 'Frequency',
                cell: (item) => {
                    return (
                        <Text fz="xs" color="gray.6">
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
                            <Text fz="xs" color="gray.6">
                                {formatTime(currentLogs[0].createdAt)}
                            </Text>
                            {getLogStatusIcon(currentLogs[0], theme)}
                        </Group>
                    ) : (
                        <Text fz="xs" color="gray.6">
                            No deliveries started
                        </Text>
                    );
                },
                meta: { style: { width: 200 } },
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
        [
            users,
            charts,
            dashboards,
            projectUuid,
            logs,
            theme,
            getSlackChannelName,
        ],
    );

    return (
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {columns.map((column) => (
                        <Box
                            component="th"
                            key={column.id}
                            style={column?.meta?.style}
                        >
                            {column?.label}
                        </Box>
                    ))}
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
