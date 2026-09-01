import {
    type AiAgentAdminEvalFilters,
    type AiAgentAdminEvalSummary,
    type AiAgentAdminSortField,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Switch,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconBox,
    IconClock,
    IconHistory,
    IconMessages,
    IconRobotFace,
    IconTextCaption,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useDeferredValue, useMemo, useRef } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableVirtualizer,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteScroll } from '../../../../../hooks/useInfiniteScroll';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { useInfiniteAiAgentAdminEvals } from '../../hooks/useAiAgentAdmin';
import { useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import { AgentNamePill } from '../AgentNamePill';
import AgentsFilter from './AgentsFilter';
import { RunStatusIndicator, TimeAgo } from './EvalRunStatus';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';

type AiAgentAdminEvalsTableProps = {
    selectedEval: AiAgentAdminEvalSummary | null;
    onEvalSelect: (evalSummary: AiAgentAdminEvalSummary) => void;
};

const AiAgentAdminEvalsTable = ({
    selectedEval,
    onEvalSelect,
}: AiAgentAdminEvalsTableProps) => {
    const theme = useMantineTheme();

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
        hidePreviewProjects,
        setHidePreviewProjects,
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

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: hasNextPage ?? false,
    });

    const columns: ContentTableColumnDef<AiAgentAdminEvalSummary>[] = [
        {
            accessorKey: 'title',
            header: 'Eval',
            enableSorting: false,
            enableEditing: false,
            size: 240,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconTextCaption} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const isTruncated = useIsTruncated<HTMLDivElement>();
                const evalSummary = row.original;
                return (
                    <Stack gap={0} miw={0}>
                        <Tooltip
                            label={evalSummary.title}
                            disabled={!isTruncated.isTruncated}
                            maw={300}
                        >
                            <Text
                                fw={500}
                                fz="sm"
                                truncate
                                ref={isTruncated.ref}
                            >
                                {evalSummary.title}
                            </Text>
                        </Tooltip>
                        {evalSummary.description && (
                            <Text fz="xs" c="dimmed" truncate>
                                {evalSummary.description}
                            </Text>
                        )}
                    </Stack>
                );
            },
        },
        {
            accessorKey: 'agent',
            header: 'Agent',
            enableSorting: false,
            enableEditing: false,
            size: 120,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconRobotFace} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <AgentNamePill
                    name={row.original.agent.name}
                    imageUrl={row.original.agent.imageUrl}
                />
            ),
        },
        {
            accessorKey: 'project',
            header: 'Project',
            enableSorting: false,
            enableEditing: false,
            size: 110,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconBox} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Text fz="sm" fw={400}>
                    {row.original.project.name}
                </Text>
            ),
        },
        {
            accessorKey: 'promptCount',
            header: 'Prompts',
            enableSorting: false,
            enableEditing: false,
            size: 80,
            Header: ({ column }) => (
                <Group gap="two" wrap="nowrap">
                    <MantineIcon icon={IconMessages} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Badge variant="default">{row.original.promptCount}</Badge>
            ),
        },
        {
            accessorKey: 'latestRun',
            header: 'Latest run',
            enableSorting: false,
            enableEditing: false,
            size: 180,
            Header: ({ column }) => (
                <Group gap="two" wrap="nowrap">
                    <MantineIcon icon={IconHistory} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => {
                const { latestRun } = row.original;
                if (!latestRun) {
                    return (
                        <Text fz="xs" c="ldGray.5" fw={500}>
                            Never run
                        </Text>
                    );
                }
                return (
                    <Stack gap={2} align="flex-start">
                        <RunStatusIndicator status={latestRun.status} />
                        <TimeAgo
                            date={latestRun.completedAt ?? latestRun.createdAt}
                            fz="xs"
                            c="dimmed"
                        />
                    </Stack>
                );
            },
        },
        {
            accessorKey: 'createdAt',
            header: 'Created',
            enableSorting: true,
            enableEditing: false,
            size: 100,
            Header: ({ column }) => (
                <Group gap="two">
                    <MantineIcon icon={IconClock} color="dimmed" />
                    {column.columnDef.header}
                </Group>
            ),
            Cell: ({ row }) => (
                <Text fz="sm" c="ldGray.7">
                    {new Date(row.original.createdAt).toLocaleDateString()}
                </Text>
            ),
        },
    ];

    const table = useContentTable({
        columns,
        data: flatData,
        getRowId: (row) => row.evalUuid,
        enableColumnResizing: false,
        enableRowVirtualization: true,
        enablePagination: false,
        onGlobalFilterChange: (s: string) => {
            setSearch(s);
        },
        enableSorting: true,
        manualSorting: true,
        onSortingChange: handleSortingChange,
        enableTopToolbar: true,
        emptyState: {
            entityName: 'evals',
            title: 'No evals yet',
            description:
                "Create one from an agent's Evals tab to benchmark its answers.",
            search,
            hasActiveFilters,
            onClearFilters: resetFilters,
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: {
                maxHeight: 'calc(100dvh - 320px)',
            },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        mantineTableBodyRowProps: ({ row, table: tableInstance }) => {
            if (tableInstance.getState().showSkeletons) {
                return {};
            }

            const evalSummary = row.original;
            const isSelected = selectedEval?.evalUuid === evalSummary.evalUuid;

            return {
                style: {
                    cursor: 'pointer',
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[1]
                        : undefined,
                },
                onClick: () => onEvalSelect(evalSummary),
            };
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
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
                            hidePreviewProjects={hidePreviewProjects}
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
                            hidePreviewProjects={hidePreviewProjects}
                        />
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{ alignSelf: 'center' }}
                        />
                        <Switch
                            size="xs"
                            label="Hide preview projects"
                            checked={hidePreviewProjects}
                            onChange={(event) =>
                                setHidePreviewProjects(
                                    event.currentTarget.checked,
                                )
                            }
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
                        <Text fz="xs" fw={400} c="dimmed">
                            {hasNextPage
                                ? `(${flatData.length} of ${totalResults} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
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
        rowVirtualizerProps: { estimateSize: () => 52, overscan: 40 },
        enableRowActions: false,
    });

    return <ContentTable table={table} />;
};

export default AiAgentAdminEvalsTable;
