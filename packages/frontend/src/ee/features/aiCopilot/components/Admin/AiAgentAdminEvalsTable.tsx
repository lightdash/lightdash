import {
    type AiAgentAdminEvalFilters,
    type AiAgentAdminEvalSummary,
    type AiAgentAdminSortField,
    type AiAgentEvaluationRunSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconBox,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconCornerDownRight,
    IconMessages,
    IconRobotFace,
    IconTextCaption,
    IconTrash,
    IconWand,
} from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
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
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableVirtualizer,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { useInfiniteAiAgentAdminEvals } from '../../hooks/useAiAgentAdmin';
import { useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import { getEvaluationRuns } from '../../hooks/useAiAgentEvaluations';
import { AgentNamePill } from '../AgentNamePill';
import { statusConfig } from '../Evals/utils';
import AgentsFilter from './AgentsFilter';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';

const LATEST_RUNS_COUNT = 3;

type AdminEvalTableRow =
    | { type: 'eval'; key: string; eval: AiAgentAdminEvalSummary }
    | {
          type: 'run';
          key: string;
          eval: AiAgentAdminEvalSummary;
          run: AiAgentEvaluationRunSummary;
      }
    | { type: 'runs-loading'; key: string; eval: AiAgentAdminEvalSummary }
    | { type: 'runs-empty'; key: string; eval: AiAgentAdminEvalSummary };

const getEvalUrl = (evalSummary: AiAgentAdminEvalSummary) =>
    `/projects/${evalSummary.project.uuid}/ai-agents/${evalSummary.agent.uuid}/edit/evals/${evalSummary.evalUuid}`;

const RunStatusBadge = ({
    status,
}: {
    status: AiAgentEvaluationRunSummary['status'];
}) => (
    <Badge variant="light" color={statusConfig[status].color}>
        {statusConfig[status].label}
    </Badge>
);

const AiAgentAdminEvalsTable = () => {
    const theme = useMantineTheme();
    const navigate = useNavigate();

    const {
        search,
        selectedProjectUuids,
        selectedAgentUuids,
        sortField,
        sortDirection,
        setSearch,
        setSelectedProjectUuids,
        setSelectedAgentUuids,
        setSorting,
        hasActiveFilters,
        resetFilters,
    } = useAiAgentAdminFilters();

    const deferredSearch = useDeferredValue(search);

    const filters = useMemo<AiAgentAdminEvalFilters>(
        () => ({
            ...(deferredSearch && { search: deferredSearch }),
            ...(selectedProjectUuids.length > 0 && {
                projectUuids: selectedProjectUuids,
            }),
            ...(selectedAgentUuids.length > 0 && {
                agentUuids: selectedAgentUuids,
            }),
        }),
        [deferredSearch, selectedProjectUuids, selectedAgentUuids],
    );

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
                const newSortField: AiAgentAdminSortField =
                    id === 'title' ? 'title' : 'createdAt';
                setSorting(newSortField, desc ? 'desc' : 'asc');
            }
        },
        [sorting, setSorting],
    );

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteAiAgentAdminEvals(
            {
                pagination: {},
                filters,
                sort: { field: sortField, direction: sortDirection },
            },
            { keepPreviousData: true },
        );

    const flatData = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap((page) => page.data.evals);
    }, [data]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    const [expandedEvalUuids, setExpandedEvalUuids] = useState<
        ReadonlySet<string>
    >(new Set());

    const toggleExpanded = useCallback((evalUuid: string) => {
        setExpandedEvalUuids((previous) => {
            const next = new Set(previous);
            if (next.has(evalUuid)) {
                next.delete(evalUuid);
            } else {
                next.add(evalUuid);
            }
            return next;
        });
    }, []);

    const expandedEvals = useMemo(
        () => flatData.filter((e) => expandedEvalUuids.has(e.evalUuid)),
        [flatData, expandedEvalUuids],
    );

    const runQueries = useQueries({
        queries: expandedEvals.map((evalSummary) => ({
            queryKey: ['ai-agent-admin-eval-runs', evalSummary.evalUuid],
            queryFn: () =>
                getEvaluationRuns(
                    evalSummary.project.uuid,
                    evalSummary.agent.uuid,
                    evalSummary.evalUuid,
                ),
            staleTime: 30 * 1000,
        })),
    });

    // useQueries returns a fresh array every render, but the table needs a
    // reference-stable data array (unstable data makes the table reset internal
    // state each render, looping into "maximum update depth exceeded"). The
    // individual query `data` objects ARE stable, so cache the map and only
    // swap the reference when an entry actually changes.
    const runsDataByEvalUuidRef = useRef<
        ReadonlyMap<string, Awaited<ReturnType<typeof getEvaluationRuns>>>
    >(new Map());
    const nextRunsData = new Map(
        expandedEvals.flatMap((evalSummary, index) => {
            const runsData = runQueries[index]?.data;
            return runsData ? [[evalSummary.evalUuid, runsData] as const] : [];
        }),
    );
    const previousRunsData = runsDataByEvalUuidRef.current;
    if (
        nextRunsData.size !== previousRunsData.size ||
        [...nextRunsData].some(
            ([evalUuid, runsData]) =>
                previousRunsData.get(evalUuid) !== runsData,
        )
    ) {
        runsDataByEvalUuidRef.current = nextRunsData;
    }
    const runsDataByEvalUuid = runsDataByEvalUuidRef.current;

    const tableRows = useMemo<AdminEvalTableRow[]>(
        () =>
            flatData.flatMap((evalSummary): AdminEvalTableRow[] => {
                const evalRow: AdminEvalTableRow = {
                    type: 'eval',
                    key: evalSummary.evalUuid,
                    eval: evalSummary,
                };
                if (!expandedEvalUuids.has(evalSummary.evalUuid)) {
                    return [evalRow];
                }
                const runsData = runsDataByEvalUuid.get(evalSummary.evalUuid);
                if (!runsData) {
                    return [
                        evalRow,
                        {
                            type: 'runs-loading',
                            key: `${evalSummary.evalUuid}-loading`,
                            eval: evalSummary,
                        },
                    ];
                }
                const latestRuns = runsData.data.runs.slice(
                    0,
                    LATEST_RUNS_COUNT,
                );
                if (latestRuns.length === 0) {
                    return [
                        evalRow,
                        {
                            type: 'runs-empty',
                            key: `${evalSummary.evalUuid}-empty`,
                            eval: evalSummary,
                        },
                    ];
                }
                return [
                    evalRow,
                    ...latestRuns.map(
                        (run): AdminEvalTableRow => ({
                            type: 'run',
                            key: run.runUuid,
                            eval: evalSummary,
                            run,
                        }),
                    ),
                ];
            }),
        [flatData, expandedEvalUuids, runsDataByEvalUuid],
    );

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
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

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: ContentTableColumnDef<AdminEvalTableRow>[] = [
        {
            accessorKey: 'title',
            header: 'Eval',
            enableSorting: false,
            enableEditing: false,
            size: 320,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const isTruncated = useIsTruncated<HTMLDivElement>();
                const tableRow = row.original;

                if (tableRow.type === 'runs-loading') {
                    return (
                        <Group gap="xs" pl="3xl">
                            <Loader size="xs" color="violet" />
                            <Text fz="sm" c="ldGray.6">
                                Loading runs...
                            </Text>
                        </Group>
                    );
                }
                if (tableRow.type === 'runs-empty') {
                    return (
                        <Text fz="sm" c="ldGray.6" pl="3xl">
                            No runs yet
                        </Text>
                    );
                }
                if (tableRow.type === 'run') {
                    return (
                        <Group gap="xs" pl="xl" wrap="nowrap">
                            <MantineIcon
                                icon={IconCornerDownRight}
                                color="ldGray.5"
                            />
                            <Text fz="sm" c="ldGray.8">
                                Run{' '}
                                {new Date(
                                    tableRow.run.createdAt,
                                ).toLocaleString()}
                            </Text>
                        </Group>
                    );
                }

                const isExpanded = expandedEvalUuids.has(
                    tableRow.eval.evalUuid,
                );
                return (
                    <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.7"
                            size="sm"
                            aria-label={
                                isExpanded ? 'Collapse runs' : 'Expand runs'
                            }
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(tableRow.eval.evalUuid);
                            }}
                        >
                            <MantineIcon
                                icon={
                                    isExpanded
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                            />
                        </ActionIcon>
                        <Tooltip
                            withinPortal
                            label={tableRow.eval.title}
                            disabled={!isTruncated.isTruncated}
                            multiline
                            maw={300}
                        >
                            <Text
                                fw={500}
                                fz="sm"
                                truncate
                                ref={isTruncated.ref}
                            >
                                {tableRow.eval.title}
                            </Text>
                        </Tooltip>
                    </Group>
                );
            },
        },
        {
            accessorKey: 'agent',
            header: 'Agent',
            enableSorting: false,
            enableEditing: false,
            size: 170,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const tableRow = row.original;
                if (tableRow.type !== 'eval') return null;
                return (
                    <AgentNamePill
                        name={tableRow.eval.agent.name}
                        imageUrl={tableRow.eval.agent.imageUrl}
                    />
                );
            },
        },
        {
            accessorKey: 'project',
            header: 'Project',
            enableSorting: false,
            enableEditing: false,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconBox} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const tableRow = row.original;
                if (tableRow.type !== 'eval') return null;
                return (
                    <Text c="ldGray.9" fz="sm" fw={400}>
                        {tableRow.eval.project.name}
                    </Text>
                );
            },
        },
        {
            accessorKey: 'promptCount',
            header: 'Prompts',
            enableSorting: false,
            enableEditing: false,
            size: 110,
            Header: ({ column }) => (
                <Group gap="two" wrap="nowrap">
                    <MantineIcon icon={IconMessages} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const tableRow = row.original;
                if (tableRow.type !== 'eval') return null;
                return (
                    <Badge variant="default">{tableRow.eval.promptCount}</Badge>
                );
            },
        },
        {
            accessorKey: 'latestRun',
            header: 'Latest run',
            enableSorting: false,
            enableEditing: false,
            size: 220,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconWand} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const tableRow = row.original;
                if (tableRow.type === 'run') {
                    const { run } = tableRow;
                    const totalAssessments =
                        run.passedAssessments + run.failedAssessments;
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <RunStatusBadge status={run.status} />
                            {totalAssessments > 0 && (
                                <Text fz="xs" c="ldGray.7">
                                    {run.passedAssessments}/{totalAssessments}{' '}
                                    passed
                                </Text>
                            )}
                        </Group>
                    );
                }
                if (tableRow.type !== 'eval') return null;
                const { latestRun } = tableRow.eval;
                if (!latestRun) {
                    return (
                        <Text fz="xs" c="ldGray.5" fw={500}>
                            Never run
                        </Text>
                    );
                }
                return (
                    <Group gap="xs" wrap="nowrap">
                        <RunStatusBadge status={latestRun.status} />
                        <Text fz="xs" c="ldGray.7">
                            {new Date(
                                latestRun.completedAt ?? latestRun.createdAt,
                            ).toLocaleDateString()}
                        </Text>
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
                    <MantineIcon icon={IconClock} color="ldGray.6" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const tableRow = row.original;
                if (tableRow.type !== 'eval') return null;
                return (
                    <Text fz="sm" c="ldGray.7">
                        {new Date(tableRow.eval.createdAt).toLocaleDateString()}
                    </Text>
                );
            },
        },
    ];

    const table = useContentTable({
        columns,
        data: tableRows,
        getRowId: (row) => row.key,
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
        onSortingChange: handleSortingChange,
        enableTopToolbar: true,
        positionGlobalFilter: 'left',
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
            withColumnBorders: Boolean(tableRows.length),
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
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
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
        mantineTableBodyRowProps: ({ row, table: tableInstance }) => {
            if (tableInstance.getState().showSkeletons) {
                return {};
            }

            const tableRow = row.original;
            const isNavigable =
                tableRow.type === 'eval' || tableRow.type === 'run';

            return {
                style: {
                    cursor: isNavigable ? 'pointer' : undefined,
                    backgroundColor:
                        tableRow.type !== 'eval'
                            ? theme.colors.ldGray[0]
                            : undefined,
                },
                onClick: () => {
                    if (tableRow.type === 'eval') {
                        void navigate(getEvalUrl(tableRow.eval));
                    } else if (tableRow.type === 'run') {
                        void navigate(
                            `${getEvalUrl(tableRow.eval)}/run/${
                                tableRow.run.runUuid
                            }`,
                        );
                    }
                },
            };
        },
        mantineTableBodyCellProps: ({ row }) => {
            return {
                h: row.original.type === 'eval' ? 64 : 48,
                style: {
                    padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
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
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search evals by title"
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{ alignSelf: 'center' }}
                        />
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{ alignSelf: 'center' }}
                        />
                        <AgentsFilter
                            selectedAgentUuids={selectedAgentUuids}
                            setSelectedAgentUuids={setSelectedAgentUuids}
                            selectedProjectUuids={selectedProjectUuids}
                        />
                        {hasActiveFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    style={{ alignSelf: 'center' }}
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
                        style={{
                            borderRadius: 6,
                            padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <Text fz="sm" fw={500}>
                            {isFetching
                                ? 'Loading...'
                                : hasNextPage
                                  ? `${flatData.length} of ${totalResults} evals`
                                  : `${totalResults} evals`}
                        </Text>
                    </Box>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        ),
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="ldGray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.ldGray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text c="ldGray.8" fz="xs">
                        Loading more...
                    </Text>
                ) : (
                    <Group gap="two">
                        <Text fz="xs" c="ldGray.8">
                            {hasNextPage
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="ldGray.6">
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
        rowVirtualizerProps: { estimateSize: () => 64, overscan: 40 },
        enableFilterMatchHighlighting: true,
        enableRowActions: false,
    });

    return <ContentTable table={table} />;
};

export default AiAgentAdminEvalsTable;
