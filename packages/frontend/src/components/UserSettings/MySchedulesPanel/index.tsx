import {
    getHumanReadableCronExpression,
    isMsTeamsTarget,
    isSchedulerGsheetsOptions,
    isSlackTarget,
    SchedulerFormat,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Flex,
    Group,
    Pagination,
    Paper,
    Stack,
    Table,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCalendarStats,
    IconRefresh,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import {
    useSchedulerLogs,
    useUserSchedulers,
} from '../../../features/scheduler/hooks/useScheduler';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useProject } from '../../../hooks/useProject';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { DEFAULT_PAGE_SIZE } from '../../common/Table/constants';
import Logs from '../../SchedulersView/LogsView';
import {
    getSchedulerIcon,
    getSchedulerLink,
} from '../../SchedulersView/SchedulersViewUtils';

const MySchedulesPanel: FC = () => {
    const { classes } = useTableStyles();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [sortBy] = useState<'name' | 'created_at'>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const debouncedValue = useMemo(() => {
        return { search, page, sortBy, sortDirection };
    }, [search, page, sortBy, sortDirection]);

    const [debouncedSearchQueryAndPage] = useDebouncedValue(
        debouncedValue,
        300,
    );

    const { data: userSchedulers, isInitialLoading: isLoadingSchedulers } =
        useUserSchedulers({
            searchQuery: debouncedSearchQueryAndPage.search,
            paginateArgs: {
                page: debouncedSearchQueryAndPage.page,
                pageSize: DEFAULT_PAGE_SIZE,
            },
            sortBy: debouncedSearchQueryAndPage.sortBy,
            sortDirection: debouncedSearchQueryAndPage.sortDirection,
        });

    useEffect(() => {
        setPage(1);
    }, [search, sortBy, sortDirection]);

    const schedulers = useMemo(() => {
        return userSchedulers?.data || [];
    }, [userSchedulers]);

    const pagination = useMemo(() => {
        return userSchedulers?.pagination;
    }, [userSchedulers]);

    const { data: project } = useProject();

    const columns = useMemo(() => {
        if (!project) return [];

        return [
            {
                id: 'name',
                label: 'Name',
                cell: (item: SchedulerAndTargets) => {
                    const format = () => {
                        switch (item.format) {
                            case SchedulerFormat.CSV:
                                return 'CSV';
                            case SchedulerFormat.XLSX:
                                return 'XLSX';
                            case SchedulerFormat.IMAGE:
                                return 'Image';
                            case SchedulerFormat.GSHEETS:
                                return 'Google Sheets';
                        }
                    };
                    return (
                        <Group noWrap>
                            {getSchedulerIcon(item, {})}
                            <Stack spacing="two">
                                <Anchor
                                    component={Link}
                                    unstyled
                                    to={getSchedulerLink(item, '')}
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
                                                        {item.createdByName ||
                                                            'n/a'}
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
                                    {item.savedChartName ||
                                        item.dashboardName ||
                                        'n/a'}
                                </Text>
                            </Stack>
                        </Group>
                    );
                },
            },
            {
                id: 'destinations',
                label: 'Destinations',
                cell: (item: SchedulerAndTargets) => {
                    const currentTargets = item.targets.filter(
                        (target) => target.schedulerUuid === item.schedulerUuid,
                    );
                    let emails: string[] = [];
                    let slackChannels: string[] = [];
                    let msTeamsTargets: string[] = [];
                    currentTargets.map((t) => {
                        if (isSlackTarget(t)) {
                            return slackChannels.push(t.channel);
                        } else if (isMsTeamsTarget(t)) {
                            return msTeamsTargets.push(t.webhook);
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
            },
            {
                id: 'frequency',
                label: 'Frequency',
                cell: (item: SchedulerAndTargets) => {
                    return (
                        <Text fz="xs" color="gray.6">
                            {getHumanReadableCronExpression(
                                item.cron,
                                item.timezone || project.schedulerTimezone,
                            )}
                        </Text>
                    );
                },
            },
        ];
    }, [project]);

    return (
        <SettingsGridCard>
            <Title order={4}>My Schedules</Title>
            <Text c="gray.6" fz="xs" mb="md">
                View and manage all scheduled deliveries you have created across
                your projects.
            </Text>

            <Stack spacing="sm">
                <Paper p="sm" radius={0}>
                    <Group align="center" position="apart">
                        <TextInput
                            size="xs"
                            data-testid="my-schedules-search-input"
                            placeholder="Search schedules by name"
                            onChange={(e) => setSearch(e.target.value)}
                            value={search}
                            w={320}
                            icon={<IconSearch size={14} />}
                            rightSection={
                                search.length > 0 && (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <IconX size={14} />
                                    </ActionIcon>
                                )
                            }
                        />
                        <ActionIcon
                            onClick={() =>
                                setSortDirection(
                                    sortDirection === 'asc' ? 'desc' : 'asc',
                                )
                            }
                        >
                            <MantineIcon icon={IconRefresh} size={16} />
                        </ActionIcon>
                    </Group>
                </Paper>

                <Table className={classes.root} highlightOnHover>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <Box
                                    component="th"
                                    key={column.id}
                                    style={column.meta?.style}
                                >
                                    {column.label}
                                </Box>
                            ))}
                        </tr>
                    </thead>

                    <tbody style={{ position: 'relative' }}>
                        {isLoadingSchedulers ? (
                            <tr>
                                <td colSpan={columns.length}>
                                    <Text align="center" p="md">
                                        Loading schedules...
                                    </Text>
                                </td>
                            </tr>
                        ) : schedulers.length > 0 ? (
                            schedulers.map((item) => (
                                <tr key={item.schedulerUuid}>
                                    {columns.map((column) => (
                                        <td key={column.id}>
                                            {column.cell(item)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length}>
                                    <Text align="center" p="md">
                                        No schedules found
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>

                {pagination?.totalPageCount && pagination.totalPageCount > 1 ? (
                    <Flex m="sm" align="center" justify="center">
                        <Pagination
                            size="sm"
                            value={page}
                            onChange={setPage}
                            total={pagination?.totalPageCount}
                            mt="sm"
                        />
                    </Flex>
                ) : null}
            </Stack>
        </SettingsGridCard>
    );
};

export default MySchedulesPanel;
