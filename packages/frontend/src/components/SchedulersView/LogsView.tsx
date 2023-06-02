import { SchedulerWithLogs } from '@lightdash/common';
import {
    Anchor,
    Box,
    Collapse,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';
import React, { FC, useMemo } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import MantineIcon from '../common/MantineIcon';
import {
    Column,
    formatTime,
    getLogStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
    Log,
    SchedulerItem,
} from './SchedulersView';

type LogsProps = {
    projectUuid: string;
    schedulers: SchedulerWithLogs['schedulers'];
    logs: SchedulerWithLogs['logs'];
    users: SchedulerWithLogs['users'];
    charts: SchedulerWithLogs['charts'];
    dashboards: SchedulerWithLogs['dashboards'];
};

const Logs: FC<LogsProps> = ({
    projectUuid,
    schedulers,
    logs,
    users,
    charts,
    dashboards,
}) => {
    const { classes } = useTableStyles();
    const [opened, { toggle }] = useDisclosure(false);

    const columns = useMemo<Column[]>(() => {
        const currentLogs = (item: SchedulerItem, targets: Log[]) => {
            return targets.filter(
                (target) => target.schedulerUuid === item.schedulerUuid,
            );
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
                                {getSchedulerIcon(item)}
                                <Stack spacing="two">
                                    <Tooltip
                                        label={
                                            <Stack spacing="two">
                                                <Text fz={13} color="gray.5">
                                                    Schedule type:{' '}
                                                    <Text color="white" span>
                                                        {item.format === 'csv'
                                                            ? 'CSV'
                                                            : 'Image'}
                                                    </Text>
                                                </Text>
                                                <Text fz={13} color="gray.5">
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
                id: 'jobs',
                label: 'Job',
                cell: (item) => {
                    return currentLogs(item, logs).length > 0 ? (
                        <Box>
                            <Group spacing="xxs">
                                <Text fz={13} fw={500}>
                                    All jobs
                                </Text>
                                <UnstyledButton onClick={toggle}>
                                    <MantineIcon icon={IconChevronDown} />
                                </UnstyledButton>
                            </Group>
                            <Collapse in={opened}>
                                {currentLogs(item, logs).map((log, i) => (
                                    <Text
                                        key={i}
                                        fz={12}
                                        fw={500}
                                        pt="md"
                                        color="gray.6"
                                    >
                                        {log.task
                                            .replace(/([A-Z])/g, ' $1')
                                            .toLowerCase()}
                                    </Text>
                                ))}
                            </Collapse>
                        </Box>
                    ) : (
                        <Text fz={13} fw={500}>
                            No jobs yet
                        </Text>
                    );
                },
            },
            {
                id: 'deliveryScheduled',
                label: 'Delivery scheduled',
                cell: (item) => {
                    return currentLogs(item, logs).length > 0 ? (
                        <Box>
                            <Group spacing="xxs">
                                <Text fz={13} fw={500} color="gray.6">
                                    {formatTime(
                                        currentLogs(item, logs)[0]
                                            .scheduledTime,
                                    )}
                                </Text>
                            </Group>
                            <Collapse in={opened}>
                                {currentLogs(item, logs).map((log, i) => (
                                    <Text
                                        key={i}
                                        fz={12}
                                        fw={500}
                                        pt="md"
                                        color="gray.6"
                                    >
                                        {formatTime(log.scheduledTime)}
                                    </Text>
                                ))}
                            </Collapse>
                        </Box>
                    ) : (
                        <Text fz={13} color="gray.6">
                            -
                        </Text>
                    );
                },
            },
            {
                id: 'deliveryStarted',
                label: 'Delivery start',
                cell: (item) => {
                    return currentLogs(item, logs).length > 0 ? (
                        <Box>
                            <Group spacing="xxs">
                                <Text fz={13} fw={500} color="gray.6">
                                    {formatTime(
                                        currentLogs(item, logs)[0].createdAt,
                                    )}
                                </Text>
                            </Group>
                            <Collapse in={opened}>
                                {currentLogs(item, logs).map((log, i) => (
                                    <Text
                                        key={i}
                                        fz={12}
                                        fw={500}
                                        pt="md"
                                        color="gray.6"
                                    >
                                        {formatTime(log.createdAt)}
                                    </Text>
                                ))}
                            </Collapse>
                        </Box>
                    ) : (
                        <Text fz={13} color="gray.6">
                            -
                        </Text>
                    );
                },
            },
            {
                id: 'status',
                label: 'Status',
                cell: (item) => {
                    return (
                        <Stack align="center" justify="center">
                            {currentLogs(item, logs).length > 0 ? (
                                getLogStatusIcon(currentLogs(item, logs)[0])
                            ) : (
                                <Text fz={13} color="gray.6">
                                    -
                                </Text>
                            )}
                        </Stack>
                    );
                },
                meta: {
                    style: { width: '1px' },
                },
            },
        ];
    }, [users, charts, dashboards, projectUuid, logs, opened, toggle]);

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

export default Logs;
