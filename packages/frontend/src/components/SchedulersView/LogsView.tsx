import { SchedulerWithLogs } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Center,
    Collapse,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import groupBy from 'lodash/groupBy';
import { FC, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import MantineIcon from '../common/MantineIcon';
import {
    formatTime,
    getLogStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
    Log,
    SchedulerColumnName,
    SchedulerItem,
} from './SchedulersViewUtils';

type Column = {
    id: SchedulerColumnName;
    label?: string;
    cell: (
        item: SchedulerItem,
        logs: Log[],
        jobGroup: string,
    ) => React.ReactNode;
    meta?: {
        style: React.CSSProperties;
    };
};

interface LogsProps
    extends Pick<
        SchedulerWithLogs,
        'schedulers' | 'logs' | 'users' | 'charts' | 'dashboards'
    > {
    projectUuid: string;
}

const Logs: FC<LogsProps> = ({
    projectUuid,
    schedulers,
    logs,
    users,
    charts,
    dashboards,
}) => {
    const { classes, theme } = useTableStyles();
    const [openedUuids, setOpenedUuids] = useState<Set<string>>(new Set());
    const handleTogle = useCallback(
        (uuid: string) => {
            if (openedUuids.has(uuid)) {
                openedUuids.delete(uuid);
            } else {
                openedUuids.add(uuid);
            }
            setOpenedUuids(new Set(openedUuids));
        },
        [openedUuids],
    );

    const groupedLogs = useMemo(
        () => Object.entries(groupBy(logs, 'jobGroup')),
        [logs],
    );

    const columns = useMemo<Column[]>(() => {
        return [
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
                        <Group noWrap>
                            {getSchedulerIcon(item, theme)}

                            <Stack spacing="two">
                                <Anchor
                                    unstyled
                                    component={Link}
                                    to={getSchedulerLink(item, projectUuid)}
                                    target="_blank"
                                >
                                    <Tooltip
                                        label={
                                            <Stack spacing="two" fz="xs">
                                                <Text color="gray.5">
                                                    Schedule type:{' '}
                                                    <Text color="white" span>
                                                        {item.format === 'csv'
                                                            ? 'CSV'
                                                            : 'Image'}
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
                        width: 250,
                    },
                },
            },
            {
                id: 'jobs',
                label: 'Job',
                cell: (_item, currentLogs, jobGroup) => {
                    return currentLogs.length === 0 ? (
                        <Text fz="xs" fw={500}>
                            No jobs yet
                        </Text>
                    ) : (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Group spacing="two">
                                <Text>All jobs</Text>
                                <ActionIcon
                                    onClick={() => handleTogle(jobGroup)}
                                    size="sm"
                                >
                                    <MantineIcon
                                        icon={IconChevronDown}
                                        color="black"
                                        size={13}
                                    />
                                </ActionIcon>
                            </Group>
                            <Collapse in={openedUuids.has(jobGroup)}>
                                <Stack spacing="md">
                                    {currentLogs.map((log, i) => (
                                        <Text key={i}>
                                            {capitalize(
                                                log.task.replace(
                                                    /([A-Z])/g,
                                                    ' $1',
                                                ),
                                            )}
                                        </Text>
                                    ))}
                                </Stack>
                            </Collapse>
                        </Stack>
                    );
                },
            },
            {
                id: 'deliveryScheduled',
                label: 'Delivery scheduled',
                cell: (_item, currentLogs, jobGroup) => {
                    return currentLogs.length === 0 ? (
                        <Text fz="xs" color="gray.6">
                            -
                        </Text>
                    ) : (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Text color="gray.6">
                                {formatTime(currentLogs[0].scheduledTime)}
                            </Text>
                            <Collapse in={openedUuids.has(jobGroup)}>
                                <Stack spacing="md">
                                    {currentLogs.map((log, i) => (
                                        <Text key={i} color="gray.6">
                                            {formatTime(log.scheduledTime)}
                                        </Text>
                                    ))}
                                </Stack>
                            </Collapse>
                        </Stack>
                    );
                },
            },
            {
                id: 'deliveryStarted',
                label: 'Delivery start',
                cell: (_item, currentLogs, jobGroup) => {
                    return currentLogs.length === 0 ? (
                        <Text fz="xs" color="gray.6">
                            -
                        </Text>
                    ) : (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Text color="gray.6">
                                {formatTime(currentLogs[0].createdAt)}
                            </Text>
                            <Collapse in={openedUuids.has(jobGroup)}>
                                <Stack spacing="md">
                                    {currentLogs.map((log, i) => (
                                        <Text key={i} color="gray.6">
                                            {formatTime(log.createdAt)}
                                        </Text>
                                    ))}
                                </Stack>
                            </Collapse>
                        </Stack>
                    );
                },
            },
            {
                id: 'status',
                label: 'Status',
                cell: (_item, currentLogs, jobGroup) => {
                    return (
                        <Center fz="xs" fw={500}>
                            {currentLogs.length === 0 ? (
                                <Text color="gray.6">-</Text>
                            ) : (
                                <Stack>
                                    {getLogStatusIcon(currentLogs[0], theme)}
                                    <Collapse in={openedUuids.has(jobGroup)}>
                                        <Stack>
                                            {currentLogs.map((log) =>
                                                getLogStatusIcon(log, theme),
                                            )}
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            )}
                        </Center>
                    );
                },
                meta: {
                    style: { width: '1px' },
                },
            },
        ];
    }, [
        users,
        charts,
        dashboards,
        projectUuid,
        theme,
        handleTogle,
        openedUuids,
    ]);

    return (
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {columns.map((column) => {
                        return (
                            <th key={column.id} style={column?.meta?.style}>
                                {column?.label}
                            </th>
                        );
                    })}
                </tr>
            </thead>

            <tbody>
                {groupedLogs.map(([jobGroup, schedulerLogs]) => {
                    const schedulerItem = schedulers.find(
                        (item) =>
                            item.schedulerUuid ===
                            schedulerLogs[0].schedulerUuid,
                    );
                    return !schedulerItem ? null : (
                        <tr key={jobGroup}>
                            {columns.map((column) => (
                                <td key={column.id}>
                                    {column.cell(
                                        schedulerItem,
                                        schedulerLogs,
                                        jobGroup,
                                    )}
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
};

export default Logs;
