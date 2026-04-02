import { type ApiAppSummary } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconDots, IconExternalLink, IconPencil } from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { Link } from 'react-router';
import { useMyApps } from '../../../features/apps/hooks/useMyApps';

const statusColor = (status: string | null) => {
    switch (status) {
        case 'ready':
            return 'green';
        case 'building':
            return 'blue';
        case 'error':
            return 'red';
        default:
            return 'gray';
    }
};

const MyAppsPanel: FC = () => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const { data, fetchNextPage, isFetching, isLoading, isError } = useMyApps();

    const flatData = useMemo<ApiAppSummary[]>(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    !isFetching &&
                    totalFetched < totalDBRowCount
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalDBRowCount],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: MRT_ColumnDef<ApiAppSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: false,
                size: 200,
                Cell: ({ row }) => (
                    <Text fz="sm" fw={500} truncate="end">
                        {row.original.name ||
                            `Untitled app ${row.original.appUuid.slice(0, 8)}`}
                    </Text>
                ),
            },
            {
                accessorKey: 'projectName',
                header: 'Project',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                accessorKey: 'lastVersionStatus',
                header: 'Status',
                enableSorting: false,
                size: 100,
                Cell: ({ row }) => {
                    const { lastVersionStatus, lastVersionNumber } =
                        row.original;
                    return (
                        <Group gap="xs">
                            <Badge
                                variant="light"
                                color={statusColor(lastVersionStatus)}
                                size="sm"
                            >
                                {lastVersionStatus ?? 'no versions'}
                            </Badge>
                            {lastVersionNumber && (
                                <Text fz="xs" c="dimmed">
                                    v{lastVersionNumber}
                                </Text>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {new Date(row.original.createdAt).toLocaleDateString()}
                    </Text>
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 60,
                mantineTableHeadCellProps: { align: 'right' },
                mantineTableBodyCellProps: { align: 'right' },
                Cell: ({ row }) => {
                    const app = row.original;
                    const latestVersion = app.lastVersionNumber;
                    const hasReadyVersion =
                        app.lastVersionStatus === 'ready' && latestVersion;

                    return (
                        <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                >
                                    <IconDots size={16} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {hasReadyVersion && (
                                    <Menu.Item
                                        component={Link}
                                        to={`/projects/${app.projectUuid}/apps/${app.appUuid}/versions/${latestVersion}/preview`}
                                        target="_blank"
                                        leftSection={
                                            <IconExternalLink size={14} />
                                        }
                                    >
                                        Preview latest
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    component={Link}
                                    to={`/projects/${app.projectUuid}/apps/${app.appUuid}`}
                                    leftSection={<IconPencil size={14} />}
                                >
                                    Continue building
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [],
    );

    const table = useMantineReactTable({
        columns,
        data: flatData,
        enableColumnActions: false,
        enableColumnFilters: false,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
            onScroll: (event: React.UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        state: {
            isLoading,
            showProgressBars: isFetching,
            showAlertBanner: isError,
        },
    });

    if (isLoading && flatData.length === 0) {
        return (
            <Group justify="center" p="xl">
                <Loader size="sm" />
            </Group>
        );
    }

    if (!isLoading && !isError && flatData.length === 0) {
        return (
            <Text c="dimmed" fz="sm" p="md">
                You haven't created any apps yet.
            </Text>
        );
    }

    return (
        <Stack gap="md">
            <MantineReactTable table={table} />
        </Stack>
    );
};

export default MyAppsPanel;
