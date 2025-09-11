import {
    type AiAgentAdminSortField,
    type AiAgentAdminThreadSummary,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Paper,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconBox,
    IconClick,
    IconClock,
    IconMessageCircleStar,
    IconMessages,
    IconRadar,
    IconRobotFace,
    IconTextCaption,
    IconUser,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_SortingState,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import SlackSvg from '../../../../../svgs/slack.svg?react';
import { useInfiniteAiAgentAdminThreads } from '../../hooks/useAiAgentAdmin';
import { AiAgentAdminTopToolbar } from './AiAgentAdminTopToolbar';

type AiAgentAdminThreadsTableProps = {
    onThreadSelect?: (thread: AiAgentAdminThreadSummary) => void;
    selectedThread?: AiAgentAdminThreadSummary | null;
    setSelectedThread?: (thread: AiAgentAdminThreadSummary) => void;
};

const AiAgentAdminThreadsTable = ({
    onThreadSelect,
    setSelectedThread,
    selectedThread,
}: AiAgentAdminThreadsTableProps) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const [sorting, setSorting] = useState<MRT_SortingState>([
        { id: 'createdAt', desc: true },
    ]);
    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );
    const [selectedAgentUuids, setSelectedAgentUuids] = useState<string[]>([]);
    const [selectedSource, setSelectedSource] = useState<
        'all' | 'web_app' | 'slack'
    >('all');
    const [selectedFeedback, setSelectedFeedback] = useState<
        'all' | 'thumbs_up' | 'thumbs_down'
    >('all');

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const sortBy:
        | {
              sortField: AiAgentAdminSortField;
              sortDirection: 'asc' | 'desc';
          }
        | undefined = useMemo(() => {
        if (sorting.length === 0) return undefined;

        const firstSorting = sorting[0];
        let sortField: AiAgentAdminSortField = 'createdAt';

        if (firstSorting.id === 'title') {
            sortField = 'title';
        } else if (firstSorting.id === 'createdAt') {
            sortField = 'createdAt';
        }

        return {
            sortField,
            sortDirection: firstSorting.desc ? 'desc' : 'asc',
        };
    }, [sorting]);

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteAiAgentAdminThreads(
            {
                pagination: {},
                filters: {
                    ...(deferredSearch && { search: deferredSearch }),
                    projectUuids:
                        selectedProjectUuids.length > 0
                            ? selectedProjectUuids
                            : undefined,
                    agentUuids:
                        selectedAgentUuids.length > 0
                            ? selectedAgentUuids
                            : undefined,
                    createdFrom:
                        selectedSource !== 'all' ? selectedSource : undefined,
                    humanScore:
                        selectedFeedback === 'thumbs_up'
                            ? 1
                            : selectedFeedback === 'thumbs_down'
                            ? -1
                            : undefined,
                },
                sort: {
                    field: sortBy?.sortField ?? 'createdAt',
                    direction: sortBy?.sortDirection ?? 'desc',
                },
            },
            { keepPreviousData: true },
        );

    const flatData = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap((page) => page.data.threads);
    }, [data]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table
    const [tableData, setTableData] = useState<AiAgentAdminThreadSummary[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    // Called on scroll to fetch more data as the user scrolls and reaches bottom of table
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                // Once the user has scrolled within 200px of the bottom, fetch more data if available
                if (
                    scrollHeight - scrollTop - clientHeight < 200 &&
                    !isFetching &&
                    hasNextPage
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );

    // Check if we need to fetch more data on mount
    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: MRT_ColumnDef<AiAgentAdminThreadSummary>[] = [
        {
            accessorKey: 'title',
            header: 'Thread',
            enableSorting: false,
            enableEditing: false,
            size: 300,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconTextCaption} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const isTruncated = useIsTruncated<HTMLDivElement>();
                const thread = row.original;
                return (
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={thread.title || 'Untitled Thread'}
                        disabled={!isTruncated.isTruncated}
                        multiline
                        maw={300}
                    >
                        <Text fw={500} fz="sm" truncate ref={isTruncated.ref}>
                            {thread.title || 'Untitled Thread'}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            accessorKey: 'agent.name',
            header: 'Agent',
            enableSorting: false,
            enableEditing: false,
            size: 170,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRobotFace} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <Paper px="xs" maw="100%">
                        <Group gap="two" wrap="nowrap">
                            <LightdashUserAvatar
                                size={12}
                                variant="filled"
                                name={thread.agent.name}
                                src={thread.agent.imageUrl}
                            />
                            <Text
                                fz="sm"
                                fw={500}
                                c="gray.7"
                                truncate
                                maw={220}
                            >
                                {thread.agent.name}
                            </Text>
                        </Group>
                    </Paper>
                );
            },
        },
        {
            accessorKey: 'project.name',
            header: 'Project',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconBox} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;

                return (
                    <Text c="gray.9" fz="sm" fw={400}>
                        {thread.project.name}
                    </Text>
                );
            },
        },
        {
            accessorKey: 'user.name',
            header: 'User',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconUser} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={thread.user.email}
                    >
                        <Text c="gray.9" fz="sm" fw={400}>
                            {thread.user.name}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            accessorKey: 'createdFrom',
            header: 'Source',
            enableSorting: false,
            enableEditing: false,
            size: 120,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRadar} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                let label = thread.createdFrom;
                if (label === 'slack') {
                    label = 'Slack';
                } else if (label === 'web_app') {
                    label = 'App';
                }

                return (
                    <Group gap="two">
                        {label === 'Slack' ? (
                            <SlackSvg
                                style={{
                                    width: '12px',
                                    height: '12px',
                                }}
                            />
                        ) : (
                            <MantineIcon
                                icon={IconMessageCircleStar}
                                size="md"
                                color={'indigo.8'}
                                stroke={1.6}
                            />
                        )}
                        <Text fz="xs" c="gray.7" fw={500}>
                            {label}
                        </Text>
                    </Group>
                );
            },
        },
        {
            accessorKey: 'promptCount',
            header: 'Prompts',
            enableSorting: false,
            enableEditing: false,
            size: 120,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconMessages} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return <Badge variant="default">{thread.promptCount}</Badge>;
            },
        },
        {
            accessorKey: 'feedbackSummary',
            header: 'Feedback',
            enableSorting: false,
            enableEditing: false,
            size: 140,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClick} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const { feedbackSummary } = row.original;
                return (
                    <Group gap="xs">
                        {feedbackSummary.neutral > 0 && (
                            <Text fz="xs" c="gray.6">
                                ~{feedbackSummary.neutral}
                            </Text>
                        )}
                        {feedbackSummary.upvotes > 0 && (
                            <Text fz="xs" c="green.6">
                                ↑{feedbackSummary.upvotes}
                            </Text>
                        )}
                        {feedbackSummary.downvotes > 0 && (
                            <Text fz="xs" c="red.6">
                                ↓{feedbackSummary.downvotes}
                            </Text>
                        )}
                    </Group>
                );
            },
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            enableSorting: true,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClock} color="gray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const thread = row.original;
                return (
                    <Text fz="sm" c="gray.7">
                        {new Date(thread.createdAt).toLocaleDateString()}
                    </Text>
                );
            },
        },
    ];

    const table = useMantineReactTable({
        columns,
        data: tableData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowVirtualization: true,
        enablePagination: false,
        enableFilters: true,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        onGlobalFilterChange: (s: string) => {
            setSearch(s);
        },
        enableSorting: true,
        manualSorting: true,
        onSortingChange: setSorting,
        enableTopToolbar: true,
        positionGlobalFilter: 'left',
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.gray[2]}`,
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
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
                'th > div > div:last-child': {
                    top: -10,
                    right: -5,
                },
                'th > div > div:last-child > .mantine-Divider-root': {
                    border: 'none',
                },
            },
        },
        mantineTableHeadCellProps: (props) => {
            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());

            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            const canResize = props.column.getCanResize();

            return {
                bg: 'gray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.gray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
                sx: {
                    justifyContent: 'center',
                    '&:hover': canResize
                        ? {
                              borderRight: !isAnyColumnResizing
                                  ? `2px solid ${theme.colors.blue[3]} !important`
                                  : undefined,
                              transition: `border-right ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                          }
                        : {},
                },
            };
        },
        mantineTableBodyProps: {
            sx: {
                flexGrow: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                'tr:last-of-type > td': {
                    borderBottom: 'none',
                    borderLeft: 'none !important',
                },
            },
        },
        mantineTableBodyRowProps: ({ row }) => {
            const thread = row.original;
            const isSelected = selectedThread?.uuid === thread.uuid;

            return {
                sx: {
                    cursor: 'pointer',
                    '&:hover': {
                        td: {
                            backgroundColor: isSelected
                                ? theme.colors.indigo[0]
                                : theme.colors.gray[0],

                            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                        },
                    },
                    ...(isSelected && {
                        td: {
                            backgroundColor: theme.colors.indigo[0],
                        },
                    }),
                },
                onClick: () => {
                    setSelectedThread?.(thread);
                    if (onThreadSelect) {
                        onThreadSelect(thread);
                    } else {
                        void navigate(
                            `/projects/${thread.project.uuid}/ai-agents/${thread.agent.uuid}/threads/${thread.uuid}`,
                        );
                    }
                },
            };
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 72,
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    borderTop: 'none',
                },
                sx: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                },
            };
        },
        renderTopToolbar: () => (
            <AiAgentAdminTopToolbar
                search={search}
                setSearch={setSearch}
                selectedProjectUuids={selectedProjectUuids}
                setSelectedProjectUuids={setSelectedProjectUuids}
                selectedAgentUuids={selectedAgentUuids}
                setSelectedAgentUuids={setSelectedAgentUuids}
                selectedSource={selectedSource}
                setSelectedSource={setSelectedSource}
                selectedFeedback={selectedFeedback}
                setSelectedFeedback={setSelectedFeedback}
                totalResults={totalResults}
                isFetching={isFetching}
                hasNextPage={hasNextPage ?? false}
                currentResultsCount={flatData.length}
            />
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="gray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.gray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text c="gray.8" fz="xs">
                        Loading more...
                    </Text>
                ) : (
                    <Group gap="two">
                        <Text fz="xs" c="gray.8">
                            {hasNextPage
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="gray.6">
                            {hasNextPage
                                ? `(${flatData.length} of ${totalResults} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
        icons: {
            IconArrowsSort: () => (
                <MantineIcon icon={IconArrowsSort} size="md" color="gray.5" />
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
            globalFilter: search ?? '',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
        initialState: {
            showGlobalFilter: true,
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        enableFilterMatchHighlighting: true,
        enableRowActions: false,
    });

    return <MantineReactTable table={table} />;
};

export default AiAgentAdminThreadsTable;
