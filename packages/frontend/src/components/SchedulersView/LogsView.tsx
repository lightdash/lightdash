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
import React, { FC, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import MantineIcon from '../common/MantineIcon';
import {
    camelCaseToFlat,
    Column,
    formatTime,
    getLogStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
    Log,
    SchedulerItem,
} from './SchedulersViewUtils';

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
    const columns = useMemo<Column[]>(() => {
        const getCurrentLogs = (item: SchedulerItem, allLogs: Log[]) => {
            return allLogs.filter(
                (log) => log.schedulerUuid === item.schedulerUuid,
            );
        };
        const getFilteredLogs = (currentLogs: Log[]) => {
            return currentLogs.length > 0
                ? {
                      handleLogs: currentLogs.filter(
                          (log) => log.task === 'handleScheduledDelivery',
                      ),
                      sendLogs: currentLogs.filter(
                          (log) =>
                              log.task === 'sendEmailNotification' ||
                              log.task === 'sendSlackNotification',
                      ),
                  }
                : {
                      handleLogs: [],
                      sendLogs: [],
                  };
        };

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
                cell: (item) => {
                    const currentLogs = getCurrentLogs(item, logs);
                    const { handleLogs, sendLogs } =
                        getFilteredLogs(currentLogs);
                    return currentLogs.length > 0 ? (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Group spacing="two">
                                <Text>All jobs</Text>
                                <ActionIcon
                                    onClick={() =>
                                        handleTogle(item.schedulerUuid)
                                    }
                                    size="sm"
                                >
                                    <MantineIcon
                                        icon={IconChevronDown}
                                        color="black"
                                        size={13}
                                    />
                                </ActionIcon>
                            </Group>
                            <Collapse in={openedUuids.has(item.schedulerUuid)}>
                                <Stack spacing="md">
                                    <Text>
                                        {handleLogs.length > 0
                                            ? camelCaseToFlat(
                                                  handleLogs[0].task,
                                              )
                                            : 'handle scheduled delivery'}
                                    </Text>
                                    <Text>
                                        {sendLogs.length > 0
                                            ? camelCaseToFlat(sendLogs[0].task)
                                            : 'send notification'}
                                    </Text>
                                </Stack>
                            </Collapse>
                        </Stack>
                    ) : (
                        <Text fz="xs" fw={500}>
                            No jobs yet
                        </Text>
                    );
                },
            },
            {
                id: 'deliveryScheduled',
                label: 'Delivery scheduled',
                cell: (item) => {
                    const currentLogs = getCurrentLogs(item, logs);
                    const { handleLogs, sendLogs } =
                        getFilteredLogs(currentLogs);
                    return currentLogs.length > 0 ? (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Text color="gray.6">
                                {formatTime(currentLogs[0].scheduledTime)}
                            </Text>
                            <Collapse in={openedUuids.has(item.schedulerUuid)}>
                                <Stack spacing="md">
                                    <Text color="gray.6">
                                        {handleLogs.length > 0
                                            ? formatTime(
                                                  handleLogs[0].scheduledTime,
                                              )
                                            : '-'}
                                    </Text>
                                    <Text color="gray.6">
                                        {sendLogs.length > 0
                                            ? formatTime(
                                                  sendLogs[0].scheduledTime,
                                              )
                                            : '-'}
                                    </Text>
                                </Stack>
                            </Collapse>
                        </Stack>
                    ) : (
                        <Text fz="xs" color="gray.6">
                            -
                        </Text>
                    );
                },
            },
            {
                id: 'deliveryStarted',
                label: 'Delivery start',
                cell: (item) => {
                    const currentLogs = getCurrentLogs(item, logs);
                    const { handleLogs, sendLogs } =
                        getFilteredLogs(currentLogs);
                    return currentLogs.length > 0 ? (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Text color="gray.6">
                                {formatTime(currentLogs[0].createdAt)}
                            </Text>
                            <Collapse in={openedUuids.has(item.schedulerUuid)}>
                                <Stack spacing="md">
                                    <Text color="gray.6">
                                        {handleLogs.length > 0
                                            ? formatTime(
                                                  handleLogs[0].createdAt,
                                              )
                                            : '-'}
                                    </Text>
                                    <Text color="gray.6">
                                        {sendLogs.length > 0
                                            ? formatTime(sendLogs[0].createdAt)
                                            : '-'}
                                    </Text>
                                </Stack>
                            </Collapse>
                        </Stack>
                    ) : (
                        <Text fz="xs" color="gray.6">
                            -
                        </Text>
                    );
                },
            },
            {
                id: 'status',
                label: 'Status',
                cell: (item) => {
                    const currentLogs = getCurrentLogs(item, logs);
                    const { handleLogs, sendLogs } =
                        getFilteredLogs(currentLogs);
                    return (
                        <Center fz="xs" fw={500}>
                            {currentLogs.length > 0 ? (
                                <Stack>
                                    {getLogStatusIcon(currentLogs[0], theme)}
                                    <Collapse
                                        in={openedUuids.has(item.schedulerUuid)}
                                    >
                                        <Stack>
                                            {handleLogs.length > 0 ? (
                                                getLogStatusIcon(
                                                    handleLogs[0],
                                                    theme,
                                                )
                                            ) : (
                                                <Text
                                                    color="gray.6"
                                                    ta="center"
                                                >
                                                    -
                                                </Text>
                                            )}
                                            {sendLogs.length > 0 ? (
                                                getLogStatusIcon(
                                                    sendLogs[0],
                                                    theme,
                                                )
                                            ) : (
                                                <Text
                                                    color="gray.6"
                                                    ta="center"
                                                >
                                                    -
                                                </Text>
                                            )}
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            ) : (
                                <Text color="gray.6">-</Text>
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
        logs,
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

export default Logs;
