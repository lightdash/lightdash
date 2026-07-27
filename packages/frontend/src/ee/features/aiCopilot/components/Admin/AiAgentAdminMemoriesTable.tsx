import {
    type AiAgentAdminMemoryItem,
    type AiAgentAdminMemorySortField,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconBox,
    IconBrain,
    IconCircleDotted,
    IconClock,
    IconFileText,
    IconQuote,
    IconRobotFace,
    IconTrash,
    IconUser,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteAiAgentAdminMemories } from '../../hooks/useAiAgentAdmin';
import { useAiAgentAdminMemoryFilters } from '../../hooks/useAiAgentAdminMemoryFilters';
import { AgentNamePill } from '../AgentNamePill';
import {
    AdminMemoryDetailsModal,
    type AdminMemorySelection,
} from './AdminMemoryDetailsModal';
import styles from './AiAgentAdminMemoriesTable.module.css';
import { MEMORY_STATUS_COLORS, MEMORY_STATUS_LABELS } from './memoryStatus';
import MemoryStatusFilter from './MemoryStatusFilter';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';
import UsersFilter from './UsersFilter';

const SORTABLE_COLUMNS: AiAgentAdminMemorySortField[] = [
    'generatedAt',
    'citedCount',
];

const isSortableColumn = (id: string): id is AiAgentAdminMemorySortField =>
    SORTABLE_COLUMNS.includes(id as AiAgentAdminMemorySortField);

const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString() : 'Never';

const AiAgentAdminMemoriesTable = () => {
    const theme = useMantineTheme();
    const [selectedMemory, setSelectedMemory] =
        useState<AdminMemorySelection | null>(null);

    const {
        search,
        selectedProjectUuids,
        selectedUserUuids,
        selectedStatuses,
        sortField,
        sortDirection,
        apiFilters,
        setSearch,
        setSelectedProjectUuids,
        setSelectedUserUuids,
        setSelectedStatuses,
        setSorting,
        hasActiveFilters,
        resetFilters,
    } = useAiAgentAdminMemoryFilters();

    // The search input writes to the URL per keystroke; debounce the query so a
    // body-wide ILIKE doesn't run on every character
    const [debouncedSearch] = useDebouncedValue(search, 300);

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteAiAgentAdminMemories(
            {
                pagination: {},
                filters: { ...apiFilters, search: debouncedSearch },
                sort: { field: sortField, direction: sortDirection },
            },
            { keepPreviousData: true },
        );

    const tableData = useMemo(
        () => data?.pages.flatMap((page) => page.data.memories) ?? [],
        [data],
    );

    const totalResults =
        data?.pages[data.pages.length - 1]?.pagination?.totalResults ?? 0;

    const sorting = useMemo<ContentTableSortingState>(
        () => [{ id: sortField, desc: sortDirection === 'desc' }],
        [sortField, sortDirection],
    );

    const handleSortingChange = useCallback(
        (
            updaterOrValue:
                | ContentTableSortingState
                | ((old: ContentTableSortingState) => ContentTableSortingState),
        ) => {
            const newSorting =
                typeof updaterOrValue === 'function'
                    ? updaterOrValue(sorting)
                    : updaterOrValue;

            if (newSorting.length > 0) {
                const { id, desc } = newSorting[0];
                setSorting(
                    isSortableColumn(id) ? id : 'generatedAt',
                    desc ? 'desc' : 'asc',
                );
            }
        },
        [sorting, setSorting],
    );

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

    const getBottomToolbarLabel = () => {
        if (isFetching) return 'Loading more...';
        return hasNextPage ? 'Scroll for more results' : 'All results loaded';
    };
    const bottomToolbarLabel = getBottomToolbarLabel();

    const columns: ContentTableColumnDef<AiAgentAdminMemoryItem>[] = useMemo(
        () => [
            {
                accessorKey: 'title',
                header: 'Memory',
                enableSorting: false,
                size: 320,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconBrain} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const memory = row.original;
                    return (
                        <Stack gap={2} miw={0}>
                            <Text fw={600} fz="sm" c="ldGray.9" truncate>
                                {memory.title}
                            </Text>
                            <Text fz="xs" c="ldGray.6" truncate>
                                {memory.slug}
                            </Text>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'summary',
                header: 'Summary',
                enableSorting: false,
                size: 320,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconFileText} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Tooltip
                        withinPortal
                        label={row.original.summary}
                        disabled={!row.original.summary}
                        multiline
                        maw={400}
                    >
                        <Text fz="sm" c="ldGray.7" lineClamp={2}>
                            {row.original.summary}
                        </Text>
                    </Tooltip>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                enableSorting: false,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconCircleDotted} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Badge
                        variant="light"
                        radius="sm"
                        tt="none"
                        color={MEMORY_STATUS_COLORS[row.original.status]}
                    >
                        {MEMORY_STATUS_LABELS[row.original.status]}
                    </Badge>
                ),
            },
            {
                accessorKey: 'project.name',
                header: 'Project',
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconBox} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text c="ldGray.9" fz="sm" truncate>
                        {row.original.project.name}
                    </Text>
                ),
            },
            {
                accessorKey: 'agent.name',
                header: 'Agent',
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { agent } = row.original;
                    if (!agent) {
                        return (
                            <Text c="ldGray.5" fz="xs" fs="italic">
                                Deleted agent
                            </Text>
                        );
                    }
                    return (
                        <AgentNamePill
                            name={agent.name}
                            imageUrl={agent.imageUrl}
                        />
                    );
                },
            },
            {
                accessorKey: 'user.name',
                header: 'User',
                enableSorting: false,
                size: 180,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { user } = row.original;
                    if (!user) {
                        return (
                            <Text c="ldGray.5" fz="xs" fs="italic">
                                Unknown
                            </Text>
                        );
                    }
                    return (
                        <Tooltip
                            withinPortal
                            label={user.email}
                            disabled={!user.email}
                        >
                            <Text c="ldGray.9" fz="sm" truncate>
                                {user.name}
                            </Text>
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'citedCount',
                header: 'Cited',
                enableSorting: true,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconQuote} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Stack gap={2}>
                        <Badge variant="default">
                            {row.original.citedCount}
                        </Badge>
                        <Text fz="xs" c="ldGray.6">
                            {formatDate(row.original.lastCitedAt)}
                        </Text>
                    </Stack>
                ),
            },
            {
                accessorKey: 'generatedAt',
                header: 'Generated',
                enableSorting: true,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {formatDate(row.original.generatedAt)}
                    </Text>
                ),
            },
        ],
        [],
    );

    const table = useContentTable({
        columns,
        data: tableData,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: true,
        manualSorting: true,
        onSortingChange: handleSortingChange,
        enableTopToolbar: true,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: {
                maxHeight: 'calc(100dvh - 350px)',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            if (mantineTable.getState().showSkeletons) {
                return {};
            }

            const { agent, project, slug, title } = row.original;
            if (!agent) {
                return {};
            }

            return {
                style: { cursor: 'pointer' },
                onClick: () =>
                    setSelectedMemory({
                        projectUuid: project.uuid,
                        agentUuid: agent.uuid,
                        slug,
                        title,
                    }),
            };
        },
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
        renderTopToolbar: () => (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search memories"
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            className={styles.toolbarDivider}
                        />
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                            tooltipLabel="Filter memories by project"
                            projectScope="all"
                        />
                        <UsersFilter
                            selectedUserUuids={selectedUserUuids}
                            setSelectedUserUuids={setSelectedUserUuids}
                        />
                        <MemoryStatusFilter
                            selectedStatuses={selectedStatuses}
                            setSelectedStatuses={setSelectedStatuses}
                        />

                        {hasActiveFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    className={styles.toolbarDivider}
                                />
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size="sm"
                                        />
                                    }
                                    onClick={resetFilters}
                                >
                                    Clear all filters
                                </Button>
                            </>
                        )}
                    </Group>

                    <Box
                        bg="ldGray.1"
                        c="ldGray.9"
                        py="sm"
                        px="xs"
                        className={styles.resultCount}
                    >
                        <Text fz="sm" fw={500}>
                            {isInitialLoading
                                ? 'Loading...'
                                : `${tableData.length} of ${totalResults} ${
                                      totalResults === 1 ? 'memory' : 'memories'
                                  }`}
                        </Text>
                    </Box>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                className={styles.bottomToolbar}
            >
                <Text fz="xs" c="ldGray.8">
                    {bottomToolbarLabel}
                </Text>
            </Box>
        ),
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="ldGray.5" />
            ),
            IconSortAscending: () => (
                <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
            ),
            IconSortDescending: () => (
                <MantineIcon icon={IconArrowDown} size="md" color="blue.6" />
            ),
        },
        state: {
            sorting,
            showProgressBars: false,
            showSkeletons: isInitialLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: { color: 'violet' },
        },
    });

    return (
        <>
            <ContentTable table={table} />
            {selectedMemory && (
                <AdminMemoryDetailsModal
                    selection={selectedMemory}
                    onClose={() => setSelectedMemory(null)}
                />
            )}
        </>
    );
};

export default AiAgentAdminMemoriesTable;
