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
    getLogStatusIcon,
    getSchedulerIcon,
    getSchedulerLink,
} from './SchedulersView';

type LogsProps = {
    projectUuid: string;
    schedulers: SchedulerWithLogs['schedulers'];
    logs: SchedulerWithLogs['logs'];
    users: SchedulerWithLogs['users'];
};

const Logs: FC<LogsProps> = ({ projectUuid, schedulers, logs, users }) => {
    const { classes } = useTableStyles();
    const [opened, { toggle }] = useDisclosure(false);

    const columns = useMemo<Column[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                cell: (item) => {
                    const user = users.find(
                        (u) => u.userUuid === item.createdBy,
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
                                <Stack spacing="xxs">
                                    <Tooltip
                                        label={
                                            <Stack spacing={2}>
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
                                        Dashboard or chart name
                                    </Text>
                                </Stack>
                            </Group>
                        </Anchor>
                    );
                },
            },
            {
                id: 'jobs',
                label: 'Job',
                cell: (item) => {
                    const currentLogs = logs.filter(
                        (target) => target.schedulerUuid === item.schedulerUuid,
                    );
                    return currentLogs.length > 0 ? (
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
                                {currentLogs.map((log, i) => (
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
                cell: () => {
                    return (
                        // <Text fz={13} color="gray.6">
                        //     {getHumanReadableCronExpression(item.cron)}
                        // </Text>
                        <></>
                    );
                },
            },
            {
                id: 'deliveryStarted',
                label: 'Delivery start',
                cell: () => {
                    // const currentLogs = logs.filter(
                    //     (log) => log.schedulerUuid === item.schedulerUuid,
                    // );
                    return <></>;
                    // !lastLog ? (
                    //     <Text fz={13} color="gray.6">
                    //         No deliveries started
                    //     </Text>
                    // ) : lastLog.status === SchedulerJobStatus.ERROR ? (
                    //     <Group spacing="xs">
                    //         <Text fz={13} color="gray.6">
                    //             {formatTime(currentLogs[0].scheduledTime)}
                    //         </Text>
                    //         <Tooltip label={currentLogs[0].details}>
                    //             {getLogStatusIcon(currentLogs[0])}
                    //         </Tooltip>
                    //     </Group>
                    // ) : (
                    //     <Group spacing="xs">
                    //         <Text fz={13} color="gray.6">
                    //             {formatTime(lastLog.scheduledTime)}
                    //         </Text>
                    //         {getLogStatusIcon(lastLog)}
                    //     </Group>
                },
            },
            {
                id: 'status',
                label: 'Status',
                cell: (item) => {
                    const currentLogs = logs.filter(
                        (log) => log.schedulerUuid === item.schedulerUuid,
                    );
                    return (
                        <Stack align="center" justify="center">
                            {/*<ResourceActionMenu item={item} onAction={onAction} />*/}
                            {currentLogs.length > 0
                                ? getLogStatusIcon(currentLogs[0])
                                : null}
                        </Stack>
                    );
                },
                meta: {
                    style: { width: '1px' },
                },
            },
        ],
        [users, logs, projectUuid, opened, toggle],
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

export default Logs;
