import {
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapItem,
    type RoadmapFacets,
    type RoadmapPagination,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    CopyButton,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import {
    IconAlertCircle,
    IconArrowUpRight,
    IconBrandGithub,
    IconCheck,
    IconCopy,
    IconFlag,
    IconGitPullRequest,
    IconLayoutKanban,
    IconRoad,
    IconSearch,
    IconTable,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import {
    ContentTable,
    ContentTableSearchInput,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
} from '../../components/common/ContentTable';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import FilterFacet from '../../components/common/FilterFacet';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import PaginateControl from '../../components/common/PaginateControl';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useAllOrgRoadmap } from '../hooks/useOrgRoadmap';
import styles from './Roadmap.module.css';
import {
    filterAndSortRoadmapItems,
    formatRoadmapDate,
    formatRoadmapDetailDate,
    getPriorityColor,
    getRoadmapFacets,
    getRoadmapSortOption,
    getStatusColor,
} from './roadmapUtils';

type RoadmapView = 'board' | 'table';

type RoadmapColumnDefinition = {
    label: string;
    statuses: readonly RoadmapItemStatus[];
    recencyLabel?: string;
};

const TABLE_PAGE_SIZE = 20;
const VISIBLE_ITEMS_PER_COLUMN = 10;
const EMPTY_ROADMAP_ITEMS: RoadmapItem[] = [];
const DEFAULT_ROADMAP_STATUSES = [
    RoadmapItemStatus.BACKLOG,
    RoadmapItemStatus.BUILDING,
    RoadmapItemStatus.SHIPPED,
];
const COLUMN_DEFINITIONS: readonly RoadmapColumnDefinition[] = [
    {
        label: 'Backlog',
        statuses: [RoadmapItemStatus.BACKLOG],
    },
    {
        label: 'Building',
        statuses: [RoadmapItemStatus.BUILDING],
    },
    {
        label: 'Shipped',
        statuses: [RoadmapItemStatus.SHIPPED],
        recencyLabel: 'in the last month',
    },
    {
        label: 'Canceled',
        statuses: [RoadmapItemStatus.CANCELED],
        recencyLabel: 'in the last month',
    },
] as const;

const RoadmapRailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.detailRailRow} wrap="nowrap" gap="sm">
        <Text className={styles.detailRailLabel}>{label}</Text>
        <Box className={styles.detailRailValue}>{children}</Box>
    </Group>
);

const RoadmapDetailsModal: FC<{
    item: RoadmapItem | null;
    onClose: () => void;
}> = ({ item, onClose }) => {
    const theme = useMantineTheme();

    return (
        <MantineModal
            opened={item !== null}
            onClose={onClose}
            size="72rem"
            title={
                <Text
                    component="span"
                    className={styles.detailHeaderTitle}
                    lineClamp={2}
                >
                    {item?.title ?? 'Roadmap request'}
                </Text>
            }
            cancelLabel={false}
            modalBodyProps={{ py: 'lg' }}
            bodyScrollAreaMaxHeight="calc(85vh - 120px)"
        >
            {item && (
                <Box className={styles.detailLayout}>
                    <Stack className={styles.detailMain} gap={0}>
                        <Stack gap="md">
                            <Text className={styles.detailSectionLabel}>
                                Description
                            </Text>
                            {item.description ? (
                                <Box className={styles.markdown}>
                                    <MarkdownPreview
                                        source={item.description}
                                        rehypePlugins={[
                                            rehypeSanitize,
                                            [
                                                rehypeExternalLinks,
                                                { target: '_blank' },
                                            ],
                                        ]}
                                        style={{
                                            backgroundColor: 'inherit',
                                            color: 'inherit',
                                            fontSize: theme.fontSizes.sm,
                                        }}
                                    />
                                </Box>
                            ) : (
                                <Text c="dimmed" fz="sm">
                                    No further detail is available for this
                                    request.
                                </Text>
                            )}
                        </Stack>
                    </Stack>

                    <Box className={styles.detailDivider} />

                    <Stack
                        gap="sm"
                        className={styles.detailRailColumn}
                        component="aside"
                        aria-label="Roadmap request properties"
                    >
                        <Stack gap={2}>
                            <RoadmapRailRow label="Status">
                                <Group gap={6} wrap="nowrap">
                                    <Box
                                        className={styles.detailPropertyDot}
                                        bg={`${getStatusColor(item.status)}.6`}
                                    />
                                    <Text className={styles.detailRailText}>
                                        {item.status}
                                    </Text>
                                </Group>
                            </RoadmapRailRow>
                            <RoadmapRailRow label="Priority">
                                <Group gap={6} wrap="nowrap">
                                    <Box
                                        className={styles.detailPropertyDot}
                                        bg={`${getPriorityColor(
                                            item.priority,
                                        )}.6`}
                                    />
                                    <Text className={styles.detailRailText}>
                                        {item.priority}
                                    </Text>
                                </Group>
                            </RoadmapRailRow>
                            <RoadmapRailRow label="Ticket ID">
                                <Group gap={4} wrap="nowrap">
                                    <Text className={styles.detailTicketId}>
                                        {item.ticketId}
                                    </Text>
                                    <CopyButton value={item.ticketId}>
                                        {({ copied, copy }) => (
                                            <Tooltip
                                                label={
                                                    copied
                                                        ? 'Copied'
                                                        : 'Copy ticket ID'
                                                }
                                                withArrow
                                            >
                                                <ActionIcon
                                                    aria-label={
                                                        copied
                                                            ? 'Copied'
                                                            : 'Copy ticket ID'
                                                    }
                                                    color="ldGray.6"
                                                    onClick={copy}
                                                    size="xs"
                                                    variant="transparent"
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            copied
                                                                ? IconCheck
                                                                : IconCopy
                                                        }
                                                        size={13}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                </Group>
                            </RoadmapRailRow>
                            <RoadmapRailRow label="Created">
                                <Text className={styles.detailRailText}>
                                    {formatRoadmapDetailDate(item.createdAt)}
                                </Text>
                            </RoadmapRailRow>
                            <RoadmapRailRow label="Updated">
                                <Text className={styles.detailRailText}>
                                    {formatRoadmapDetailDate(item.updatedAt)}
                                </Text>
                            </RoadmapRailRow>
                            {item.issueUrl && (
                                <RoadmapRailRow label="Issue">
                                    <Anchor
                                        href={item.issueUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.detailRailLink}
                                    >
                                        <MantineIcon
                                            icon={IconBrandGithub}
                                            size={14}
                                        />
                                        View GitHub issue
                                        <MantineIcon
                                            icon={IconArrowUpRight}
                                            size={13}
                                        />
                                    </Anchor>
                                </RoadmapRailRow>
                            )}
                            {item.pullRequestUrl && (
                                <RoadmapRailRow label="Pull request">
                                    <Anchor
                                        href={item.pullRequestUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.detailRailLink}
                                    >
                                        <MantineIcon
                                            icon={IconGitPullRequest}
                                            size={14}
                                        />
                                        View pull request
                                        <MantineIcon
                                            icon={IconArrowUpRight}
                                            size={13}
                                        />
                                    </Anchor>
                                </RoadmapRailRow>
                            )}
                        </Stack>
                    </Stack>
                </Box>
            )}
        </MantineModal>
    );
};

const RoadmapColumn: FC<{
    label: string;
    color: string;
    items: RoadmapItem[];
    count: number;
    recencyLabel?: string;
    onSelect: (item: RoadmapItem) => void;
}> = ({ label, color, items, count, recencyLabel, onSelect }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const displayedItems =
        isExpanded || items.length <= VISIBLE_ITEMS_PER_COLUMN
            ? items
            : items.slice(0, VISIBLE_ITEMS_PER_COLUMN);
    const hasMore = items.length > VISIBLE_ITEMS_PER_COLUMN;

    return (
        <Box
            className={styles.column}
            aria-label={`${label} roadmap items`}
            data-testid={`roadmap-column-${label}`}
        >
            <Group className={styles.columnHeader} gap={8} px={4} pb="xs">
                <Box
                    w={8}
                    h={8}
                    bg={`${color}.5`}
                    className={styles.statusDot}
                />
                <Text fz="sm" fw={650}>
                    {label}
                </Text>
                <Badge color="gray" variant="light" size="sm">
                    {count}
                </Badge>
                {recencyLabel && (
                    <Text c="dimmed" fz="xs">
                        {recencyLabel}
                    </Text>
                )}
            </Group>

            <Box className={styles.columnCards}>
                {items.length === 0 ? (
                    <Box className={styles.emptyColumn}>
                        <Text c="dimmed" fz="xs">
                            No requests
                        </Text>
                    </Box>
                ) : (
                    displayedItems.map((item) => (
                        <Box className={styles.card} key={item.ticketId}>
                            <Box
                                className={styles.cardBody}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelect(item)}
                                onKeyDown={(
                                    event: React.KeyboardEvent<HTMLDivElement>,
                                ) => {
                                    if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                    ) {
                                        event.preventDefault();
                                        onSelect(item);
                                    }
                                }}
                            >
                                <Stack gap="sm">
                                    <Group
                                        justify="space-between"
                                        align="flex-start"
                                        gap="sm"
                                        wrap="nowrap"
                                    >
                                        <Text fw={550} fz="sm" lineClamp={3}>
                                            {item.title}
                                        </Text>
                                        <Text
                                            component="time"
                                            dateTime={item.updatedAt}
                                            c="dimmed"
                                            fz="xs"
                                            title={`Last updated ${new Date(
                                                item.updatedAt,
                                            ).toLocaleString()}`}
                                            className={styles.updatedAt}
                                        >
                                            {formatRoadmapDate(item.updatedAt)}
                                        </Text>
                                    </Group>
                                    <Group
                                        justify="space-between"
                                        align="center"
                                        gap="xs"
                                        wrap="nowrap"
                                    >
                                        <Badge
                                            color={getPriorityColor(
                                                item.priority,
                                            )}
                                            size="xs"
                                            variant="light"
                                        >
                                            {item.priority}
                                        </Badge>
                                        {(item.issueUrl ||
                                            item.pullRequestUrl) && (
                                            <Group gap={4} wrap="nowrap">
                                                {item.issueUrl && (
                                                    <Tooltip label="View GitHub issue">
                                                        <ActionIcon
                                                            component="a"
                                                            href={item.issueUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Open GitHub issue: ${item.title}`}
                                                            color="gray"
                                                            size="sm"
                                                            variant="subtle"
                                                            onClick={(event) =>
                                                                event.stopPropagation()
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    IconBrandGithub
                                                                }
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                                {item.pullRequestUrl && (
                                                    <Tooltip label="View pull request">
                                                        <ActionIcon
                                                            component="a"
                                                            href={
                                                                item.pullRequestUrl
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Open pull request: ${item.title}`}
                                                            color="gray"
                                                            size="sm"
                                                            variant="subtle"
                                                            onClick={(event) =>
                                                                event.stopPropagation()
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    IconGitPullRequest
                                                                }
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        )}
                                    </Group>
                                </Stack>
                            </Box>
                        </Box>
                    ))
                )}
                {hasMore && (
                    <Button
                        color="gray"
                        fullWidth
                        size="xs"
                        variant="subtle"
                        onClick={() => setIsExpanded((expanded) => !expanded)}
                    >
                        {isExpanded
                            ? 'Show less'
                            : `Show all (${items.length})`}
                    </Button>
                )}
            </Box>
        </Box>
    );
};

const RoadmapState: FC<{
    items: RoadmapItem[];
    isLoading: boolean;
    isError: boolean;
    hasActiveFilters: boolean;
    onRetry: () => void;
    children: ReactNode;
}> = ({ items, isLoading, isError, hasActiveFilters, onRetry, children }) => {
    if (isLoading) {
        return <EmptyStateLoader title="Loading your roadmap" />;
    }

    if (isError) {
        return (
            <SuboptimalState
                icon={IconAlertCircle}
                title="Could not load your roadmap"
                description="Something went wrong fetching your roadmap."
                action={
                    <Button variant="default" onClick={onRetry}>
                        Try again
                    </Button>
                }
            />
        );
    }

    if (items.length === 0) {
        return hasActiveFilters ? (
            <SuboptimalState
                icon={IconSearch}
                title="No matching requests"
                description="Try adjusting your filters."
            />
        ) : (
            <SuboptimalState
                icon={IconRoad}
                title="No roadmap items yet"
                description="When your organization raises feature requests with Lightdash, they will appear here."
            />
        );
    }

    return children;
};

type RoadmapContentProps = {
    items: RoadmapItem[];
    isLoading: boolean;
    isError: boolean;
    hasActiveFilters?: boolean;
    onRetry: () => void;
};

type RoadmapKanbanProps = RoadmapContentProps & {
    statusCounts?: RoadmapFacets['statusCounts'];
    visibleStatuses?: RoadmapItemStatus[];
};

const RoadmapKanban: FC<RoadmapKanbanProps> = ({
    items,
    statusCounts,
    visibleStatuses,
    isLoading,
    isError,
    hasActiveFilters = false,
    onRetry,
}) => {
    const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
    const columns = useMemo(
        () =>
            COLUMN_DEFINITIONS.filter(
                (column) =>
                    !visibleStatuses ||
                    visibleStatuses.length === 0 ||
                    column.statuses.some((status) =>
                        visibleStatuses.includes(status),
                    ),
            ).map((column) => ({
                ...column,
                items: items.filter((item) =>
                    column.statuses.includes(item.status),
                ),
            })),
        [items, visibleStatuses],
    );

    return (
        <RoadmapState
            items={items}
            isLoading={isLoading}
            isError={isError}
            hasActiveFilters={hasActiveFilters}
            onRetry={onRetry}
        >
            <Box className={styles.results}>
                <Box className={styles.board}>
                    {columns.map((column) => (
                        <RoadmapColumn
                            key={column.label}
                            label={column.label}
                            color={getStatusColor(column.statuses[0])}
                            items={column.items}
                            count={
                                statusCounts?.[column.statuses[0]] ??
                                column.items.length
                            }
                            recencyLabel={column.recencyLabel}
                            onSelect={setSelectedItem}
                        />
                    ))}
                </Box>
                <RoadmapDetailsModal
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                />
            </Box>
        </RoadmapState>
    );
};

type RoadmapTableProps = RoadmapContentProps & {
    pagination: RoadmapPagination;
    onPageChange: (page: number) => void;
    sorting: ContentTableSortingState;
    onSortingChange: React.Dispatch<
        React.SetStateAction<ContentTableSortingState>
    >;
};

const RoadmapTable: FC<RoadmapTableProps> = ({
    items,
    pagination,
    isLoading,
    isError,
    hasActiveFilters = false,
    onRetry,
    onPageChange,
    sorting,
    onSortingChange,
}) => {
    const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
    const theme = useMantineTheme();
    const columns = useMemo<ContentTableColumnDef<RoadmapItem>[]>(
        () => [
            {
                accessorKey: 'title',
                header: 'Request',
                size: 520,
                enableSorting: false,
                Cell: ({ row }) => (
                    <UnstyledButton
                        className={styles.listTitleButton}
                        onClick={() => setSelectedItem(row.original)}
                    >
                        <Text fw={500} fz="sm">
                            {row.original.title}
                        </Text>
                    </UnstyledButton>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                size: 140,
                enableSorting: true,
                sortDescFirst: false,
                Cell: ({ row }) => (
                    <Badge
                        color={getStatusColor(row.original.status)}
                        variant="light"
                    >
                        {row.original.status}
                    </Badge>
                ),
            },
            {
                accessorKey: 'priority',
                header: 'Priority',
                size: 140,
                enableSorting: true,
                sortDescFirst: false,
                Cell: ({ row }) => (
                    <Badge
                        color={getPriorityColor(row.original.priority)}
                        variant="light"
                    >
                        {row.original.priority}
                    </Badge>
                ),
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                size: 140,
                enableSorting: true,
                sortDescFirst: true,
                Cell: ({ row }) => (
                    <Text fz="sm">
                        {new Date(row.original.createdAt).toLocaleDateString()}
                    </Text>
                ),
            },
            {
                accessorKey: 'updatedAt',
                header: 'Updated',
                size: 140,
                enableSorting: true,
                sortDescFirst: true,
                Cell: ({ row }) => (
                    <Text fz="sm">
                        {new Date(row.original.updatedAt).toLocaleDateString()}
                    </Text>
                ),
            },
        ],
        [],
    );
    const table = useContentTable({
        columns,
        data: items,
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
        enableMultiSort: false,
        manualSorting: true,
        onSortingChange,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        getRowId: (row) => row.ticketId,
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
            sx: {
                maxHeight: 'calc(100dvh - 370px)',
            },
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        state: {
            showProgressBars: false,
            showSkeletons: isLoading,
            density: 'md',
            sorting,
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'gray',
            },
        },
    });

    return (
        <RoadmapState
            items={items}
            isLoading={isLoading}
            isError={isError}
            hasActiveFilters={hasActiveFilters}
            onRetry={onRetry}
        >
            <Stack className={styles.results} gap="sm">
                <Box className={styles.list}>
                    <ContentTable table={table} />
                </Box>

                <Group justify="space-between">
                    <Text c="dimmed" fz="xs">
                        {pagination.totalIssues} requests
                    </Text>
                    {pagination.totalPages > 1 && (
                        <PaginateControl
                            currentPage={pagination.page}
                            totalPages={pagination.totalPages}
                            hasPreviousPage={pagination.page > 1}
                            hasNextPage={
                                pagination.page < pagination.totalPages
                            }
                            onPreviousPage={() =>
                                onPageChange(pagination.page - 1)
                            }
                            onNextPage={() => onPageChange(pagination.page + 1)}
                        />
                    )}
                </Group>

                <RoadmapDetailsModal
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                />
            </Stack>
        </RoadmapState>
    );
};

const RoadmapViewSelector: FC<{
    value: RoadmapView;
    onChange: (view: RoadmapView) => void;
}> = ({ value, onChange }) => (
    <SegmentedControl
        aria-label="Roadmap view"
        ml="auto"
        size="xs"
        data={[
            {
                label: (
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconLayoutKanban} />
                        Board
                    </Group>
                ),
                value: 'board',
            },
            {
                label: (
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon icon={IconTable} />
                        Table
                    </Group>
                ),
                value: 'table',
            },
        ]}
        value={value}
        onChange={(nextValue) => onChange(nextValue as RoadmapView)}
    />
);

const Roadmap: FC = () => {
    const [view, setView] = useState<RoadmapView>('board');
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
    const [statuses, setStatuses] = useState<RoadmapItemStatus[]>(
        DEFAULT_ROADMAP_STATUSES,
    );
    const [priorities, setPriorities] = useState<RoadmapItemPriority[]>([]);
    const [tableSorting, setTableSorting] = useState<ContentTableSortingState>([
        {
            id: 'priority',
            desc: false,
        },
    ]);
    const roadmapQuery = useAllOrgRoadmap();
    const allItems = roadmapQuery.data?.data ?? EMPTY_ROADMAP_ITEMS;
    const boardItems = useMemo(
        () =>
            filterAndSortRoadmapItems({
                items: allItems,
                search: debouncedSearch,
                statuses,
                priorities,
                sortOption: 'priority',
            }),
        [allItems, debouncedSearch, priorities, statuses],
    );
    const sortedTableItems = useMemo(
        () =>
            filterAndSortRoadmapItems({
                items: allItems,
                search: debouncedSearch,
                statuses,
                priorities,
                sortOption: getRoadmapSortOption(tableSorting),
            }),
        [allItems, debouncedSearch, priorities, statuses, tableSorting],
    );
    const tableItems = sortedTableItems.slice(
        (page - 1) * TABLE_PAGE_SIZE,
        page * TABLE_PAGE_SIZE,
    );
    const totalPages = Math.ceil(boardItems.length / TABLE_PAGE_SIZE);
    const facets = useMemo(() => getRoadmapFacets(allItems), [allItems]);
    const statusCounts = useMemo(
        () => getRoadmapFacets(boardItems).statusCounts,
        [boardItems],
    );
    const hasActiveFilters = Boolean(
        search.trim() || statuses.length || priorities.length,
    );
    const resetPage = () => setPage(1);
    const handleTableSortingChange: React.Dispatch<
        React.SetStateAction<ContentTableSortingState>
    > = (updater) => {
        setTableSorting((currentSorting) => {
            const nextSorting =
                typeof updater === 'function'
                    ? updater(currentSorting)
                    : updater;

            return nextSorting.length > 0
                ? nextSorting.slice(0, 1)
                : [
                      {
                          id: currentSorting[0]?.id ?? 'priority',
                          desc: false,
                      },
                  ];
        });
        resetPage();
    };

    return (
        <Stack mb="lg" gap="md" className={styles.page}>
            <SettingsPage
                title="Roadmap"
                isBeta
                description="Feature requests from your organization and where they stand."
            >
                <Group className={styles.toolbar} gap="sm" wrap="wrap">
                    <ContentTableSearchInput
                        tooltipLabel="Search roadmap"
                        placeholder="Search roadmap"
                        value={search}
                        onChange={(value) => {
                            setSearch(value);
                            resetPage();
                        }}
                        collapsedWidth={340}
                        expandedWidth={340}
                    />
                    <FilterFacet
                        label="Status"
                        icon={IconRoad}
                        selected={statuses}
                        onChange={(values) => {
                            setStatuses(values as RoadmapItemStatus[]);
                            resetPage();
                        }}
                        options={Object.values(RoadmapItemStatus).map(
                            (value) => ({
                                value,
                                label: value,
                                count: facets?.statusCounts[value],
                            }),
                        )}
                        tooltipLabel="Filter by status"
                    />
                    <FilterFacet
                        label="Priority"
                        icon={IconFlag}
                        selected={priorities}
                        onChange={(values) => {
                            setPriorities(values as RoadmapItemPriority[]);
                            resetPage();
                        }}
                        options={Object.values(RoadmapItemPriority).map(
                            (value) => ({
                                value,
                                label: value,
                                count: facets?.priorityCounts[value],
                            }),
                        )}
                        tooltipLabel="Filter by priority"
                    />
                    <RoadmapViewSelector value={view} onChange={setView} />
                </Group>

                {view === 'board' ? (
                    <RoadmapKanban
                        items={boardItems}
                        statusCounts={statusCounts}
                        visibleStatuses={statuses}
                        isLoading={roadmapQuery.isInitialLoading}
                        isError={roadmapQuery.isError}
                        hasActiveFilters={hasActiveFilters}
                        onRetry={() => void roadmapQuery.refetch()}
                    />
                ) : (
                    <RoadmapTable
                        items={tableItems}
                        pagination={{
                            page,
                            pageSize: TABLE_PAGE_SIZE,
                            totalIssues: boardItems.length,
                            totalPages,
                        }}
                        isLoading={roadmapQuery.isInitialLoading}
                        isError={roadmapQuery.isError}
                        hasActiveFilters={hasActiveFilters}
                        onRetry={() => void roadmapQuery.refetch()}
                        onPageChange={setPage}
                        sorting={tableSorting}
                        onSortingChange={handleTableSortingChange}
                    />
                )}
            </SettingsPage>
        </Stack>
    );
};

export default Roadmap;
