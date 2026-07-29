import {
    getAppDisplayName,
    type DataAppActivityEvent,
} from '@lightdash/common';
import { Badge, Group, Text, Tooltip, useMantineTheme } from '@mantine-8/core';
import {
    IconAppWindow,
    IconBox,
    IconClock,
    IconSparkles,
    IconUser,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type UIEvent,
} from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated/index';
import { useInfiniteDataAppActivity } from '../hooks/useDataAppActivity';
import { useDataAppActivityFilters } from '../hooks/useDataAppActivityFilters';
import { DataAppActivityTopToolbar } from './DataAppActivityTopToolbar';

const STATUS_COLORS: Record<string, string> = {
    ready: 'green',
    error: 'red',
};

const PromptCell: FC<{ prompt: string }> = ({ prompt }) => {
    const { ref, isTruncated } = useIsTruncated<HTMLDivElement>();
    const text = prompt.trim();
    if (text === '') {
        return (
            <Text fz="sm" fs="italic" c="ldGray.6">
                No prompt
            </Text>
        );
    }
    return (
        <Tooltip
            withinPortal
            label={text}
            disabled={!isTruncated}
            multiline
            maw={400}
        >
            <Text ref={ref} fz="sm" c="ldGray.9" truncate>
                {text}
            </Text>
        </Tooltip>
    );
};

export const DataAppActivityTable: FC = () => {
    const theme = useMantineTheme();
    const filters = useDataAppActivityFilters();

    const {
        data,
        error,
        isError,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteDataAppActivity(filters.apiFilters, {
        keepPreviousData: true,
    });

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalResults =
        data?.pages[data.pages.length - 1]?.pagination?.totalResults ?? 0;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) return;
            const { scrollHeight, scrollTop, clientHeight } =
                containerRefElement;
            if (
                scrollHeight - scrollTop - clientHeight < 200 &&
                !isFetching &&
                hasNextPage
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    // Mirrors the other admin tables: the table memoises on identity, so the
    // rows are staged through state to force a re-render on new pages.
    const [tableData, setTableData] = useState<DataAppActivityEvent[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const columns = useMemo<ContentTableColumnDef<DataAppActivityEvent>[]>(
        () => [
            {
                id: 'createdAt',
                accessorFn: (row) => row.createdAt,
                header: 'When',
                size: 140,
                enableSorting: false,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Tooltip
                        withinPortal
                        label={dayjs(row.original.createdAt).format(
                            'YYYY-MM-DD HH:mm:ss',
                        )}
                    >
                        <Text fz="sm" c="ldGray.9" truncate>
                            {dayjs(row.original.createdAt).format(
                                'MMM D, HH:mm',
                            )}
                        </Text>
                    </Tooltip>
                ),
            },
            {
                id: 'user',
                accessorFn: (row) =>
                    row.user
                        ? `${row.user.firstName} ${row.user.lastName}`
                        : 'Unknown user',
                header: 'User',
                size: 148,
                enableSorting: false,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    row.original.user ? (
                        <Text fz="sm" c="ldGray.9" truncate>
                            {`${row.original.user.firstName} ${row.original.user.lastName}`}
                        </Text>
                    ) : (
                        <Text fz="sm" fs="italic" c="ldGray.6">
                            Deleted user
                        </Text>
                    ),
            },
            {
                id: 'app',
                accessorFn: (row) => row.appName,
                header: 'App',
                size: 168,
                enableSorting: false,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconAppWindow} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="sm" c="ldGray.9" truncate>
                            {getAppDisplayName(
                                row.original.appName,
                                row.original.appUuid,
                            )}
                        </Text>
                        {row.original.appDeleted && (
                            <Badge
                                size="xs"
                                variant="light"
                                color="gray"
                                flex="0 0 auto"
                            >
                                Deleted
                            </Badge>
                        )}
                    </Group>
                ),
            },
            {
                id: 'project',
                accessorFn: (row) => row.projectName,
                header: 'Project',
                size: 110,
                enableSorting: false,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconBox} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.9" truncate>
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                id: 'version',
                accessorFn: (row) => row.version,
                header: 'Type',
                size: 122,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="sm" c="ldGray.9" truncate>
                            {row.original.version === 1
                                ? 'Created'
                                : 'Iteration'}
                        </Text>
                        <Text
                            fz="xs"
                            c="ldGray.6"
                            ff="monospace"
                            flex="0 0 auto"
                        >
                            {`v${row.original.version}`}
                        </Text>
                    </Group>
                ),
            },
            {
                id: 'claudeModel',
                accessorFn: (row) => row.claudeModel,
                header: 'Model',
                size: 100,
                enableSorting: false,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconSparkles} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.9">
                        {row.original.claudeModel}
                    </Text>
                ),
            },
            {
                id: 'status',
                accessorFn: (row) => row.status,
                header: 'Status',
                size: 105,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Badge
                        size="sm"
                        variant="light"
                        color={STATUS_COLORS[row.original.status] ?? 'blue'}
                    >
                        {row.original.status}
                    </Badge>
                ),
            },
            {
                id: 'prompt',
                accessorFn: (row) => row.prompt,
                header: 'Prompt',
                size: 187,
                grow: true,
                enableSorting: false,
                Cell: ({ row }) => <PromptCell prompt={row.original.prompt} />,
            },
        ],
        [],
    );

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowVirtualization: true,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableSorting: false,
        enableTopToolbar: true,
        getRowId: (row) => `${row.appUuid}:${row.version}`,
        state: {
            showProgressBars: false,
            showSkeletons: isInitialLoading,
        },
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 40 },
        // Row metrics copied from the sibling admin tables (agents, threads,
        // memories) so the settings tables stay visually consistent.
        mantineTableBodyCellProps: {
            h: 72,
            style: {
                padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        emptyState: {
            entityName: 'generations',
            emptyMessage: 'No data apps have been generated yet.',
            filteredMessage: 'No generations match these filters.',
            hasActiveFilters: filters.hasActiveFilters,
            onClearFilters: filters.resetFilters,
        },
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
            sx: {
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        renderTopToolbar: () => (
            <DataAppActivityTopToolbar
                selectedProjectUuids={filters.selectedProjectUuids}
                selectedUserUuids={filters.selectedUserUuids}
                selectedModels={filters.selectedModels}
                selectedPeriod={filters.selectedPeriod}
                setSelectedProjectUuids={filters.setSelectedProjectUuids}
                setSelectedUserUuids={filters.setSelectedUserUuids}
                setSelectedModels={filters.setSelectedModels}
                setSelectedPeriod={filters.setSelectedPeriod}
                hasActiveFilters={filters.hasActiveFilters}
                resetFilters={filters.resetFilters}
                totalResults={totalResults}
                currentResultsCount={flatData.length}
                isFetching={isFetching}
                hasNextPage={Boolean(hasNextPage)}
            />
        ),
    });

    // Without this a failed request falls through to the table's empty state,
    // which would claim the org has never generated an app.
    if (isError) {
        return <ErrorState error={error?.error} />;
    }

    return <ContentTable table={table} />;
};
