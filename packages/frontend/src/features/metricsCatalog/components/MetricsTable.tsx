import { type CatalogField, type CatalogItem } from '@lightdash/common';
import {
    Button,
    Group,
    Highlight,
    HoverCard,
    Popover,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_Row,
    type MRT_SortingState,
    type MRT_Virtualizer,
} from 'mantine-react-table';
import {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type UIEvent,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useExplore } from '../../../hooks/useExplore';
import {
    createMetricPreviewUnsavedChartVersion,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../hooks/useMetricsCatalog';
import { setActiveMetric } from '../store/metricsCatalogSlice';

const MetricUsageButton = ({ row }: { row: MRT_Row<CatalogField> }) => {
    const hasChartsUsage = row.original.chartUsage ?? 0 > 0;
    const dispatch = useAppDispatch();
    const { track } = useTracking();

    const handleChartUsageClick = () => {
        if (hasChartsUsage) {
            track({
                name: EventName.METRICS_CATALOG_CHART_USAGE_CLICKED,
                properties: {
                    metricName: row.original.name,
                    chartCount: row.original.chartUsage ?? 0,
                    tableName: row.original.tableName,
                },
            });
            dispatch(setActiveMetric(row.original));
        }
    };

    return (
        <Button
            size="xs"
            compact
            color="gray.6"
            variant="default"
            disabled={!hasChartsUsage}
            onClick={handleChartUsageClick}
            leftIcon={
                <MantineIcon
                    display={hasChartsUsage ? 'block' : 'none'}
                    icon={IconChartBar}
                    color="gray.6"
                    size={12}
                    strokeWidth={1.2}
                    fill="gray.2"
                />
            }
            sx={{
                '&[data-disabled]': {
                    backgroundColor: 'transparent',
                    fontWeight: 400,
                },
            }}
            styles={{
                leftIcon: {
                    marginRight: 4,
                },
            }}
        >
            {hasChartsUsage ? `${row.original.chartUsage}` : 'No usage'}
        </Button>
    );
};

const TagManagement = memo(
    ({ hovered, leftAligned }: { hovered: boolean; leftAligned?: boolean }) => {
        const [opened, setOpened] = useState(false);
        const [search, setSearch] = useState('');

        // Get unique existing tags across all metrics
        const existingTags = useMemo(() => {
            // This should come from your global state or API
            return [
                { label: 'finance', color: 'blue' },
                { label: 'revenue', color: 'green' },
                { label: 'core-metric', color: 'red' },
                { label: 'customers', color: 'grape' },
            ]; // example
        }, []);

        const handleAddTag = (tag: string) => {
            // Implement your tag adding logic here
            console.log('Adding tag:', tag);
            setSearch('');
            setOpened(false);
        };

        return (
            <Popover
                opened={opened}
                onChange={setOpened}
                position="bottom"
                width={300}
                withArrow
                shadow="md"
                withinPortal
            >
                <Popover.Target>
                    <Button
                        variant="default"
                        size="xs"
                        compact
                        pos="absolute"
                        leftIcon={
                            <MantineIcon
                                color="gray.6"
                                size={8}
                                icon={IconPlus}
                            />
                        }
                        styles={(theme) => ({
                            leftIcon: {
                                marginRight: 4,
                            },
                            root: {
                                border: `dashed 1px ${theme.colors.gray[4]}`,
                                visibility:
                                    hovered || opened ? 'visible' : 'hidden',
                                fontSize: '10px',
                                ...(leftAligned
                                    ? {
                                          left: 0,
                                          right: 'auto',
                                          top: '50%',
                                          transform: 'translateY(-50%)',
                                          bottom: 'auto',
                                      }
                                    : {
                                          right: 0,
                                          left: 'auto',
                                          bottom: 0,
                                      }),
                            },
                        })}
                        onClick={() => setOpened((prev) => !prev)}
                    >
                        Add
                    </Button>
                </Popover.Target>
                <Popover.Dropdown p="xs">
                    <TextInput
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        size="xs"
                        mb="xs"
                        radius="md"
                    />
                    <Text size="xs" fw={500} color="dimmed" mb="xs">
                        Select a tag or create a new one
                    </Text>
                    <Stack spacing="xs" align="flex-start">
                        {existingTags
                            .filter((tag) =>
                                tag.label
                                    .toLowerCase()
                                    .includes(search.toLowerCase()),
                            )
                            .map((tag) => (
                                <Button
                                    key={tag.label}
                                    variant="light"
                                    color={tag.color}
                                    size="xs"
                                    compact
                                    onClick={() => handleAddTag(tag.label)}
                                >
                                    <Group spacing="xs">{tag.label}</Group>
                                </Button>
                            ))}
                        {search &&
                            !existingTags.some(
                                (tag) => tag.label === search,
                            ) && (
                                <Button
                                    variant="light"
                                    color="blue"
                                    size="xs"
                                    fullWidth
                                    onClick={() => handleAddTag(search)}
                                >
                                    Create "{search}"
                                </Button>
                            )}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        );
    },
);

const columns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: 'name',
        header: 'Metric Name',
        enableSorting: true,

        Cell: ({ row, table }) => (
            <Highlight highlight={table.getState().globalFilter || ''} fw={500}>
                {row.original.label}
            </Highlight>
        ),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        enableSorting: false,
        size: 350,

        Cell: ({ table, row }) => (
            <HoverCard
                withinPortal
                shadow="lg"
                position="right"
                disabled={!row.original.description}
            >
                <HoverCard.Target>
                    <Text lineClamp={2}>
                        <Highlight
                            highlight={table.getState().globalFilter || ''}
                        >
                            {row.original.description ?? ''}
                        </Highlight>
                    </Text>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                    <MarkdownPreview
                        source={row.original.description}
                        style={{
                            fontSize: '12px',
                        }}
                    />
                </HoverCard.Dropdown>
            </HoverCard>
        ),
    },
    {
        accessorKey: 'directory',
        header: 'Table',
        enableSorting: false,
        size: 120,

        Cell: ({ row }) => <Text fw={500}>{row.original.tableName}</Text>,
    },
    {
        accessorKey: 'metricTags',
        header: 'Tags',
        enableSorting: false,
        size: 150,
        minSize: 180,
        Cell: ({ row }) => {
            const { hovered, ref } = useHover();
            const tags = useMemo(() => row.original.metricTags ?? [], [row]);

            return (
                <Group spacing="two" ref={ref} pos="relative" w="100%" h="100%">
                    {tags.map((tag) => (
                        <Button
                            key={tag.label}
                            size="xs"
                            compact
                            variant="light"
                            color={tag.color}
                            sx={{ cursor: 'default' }}
                        >
                            {tag.label}
                        </Button>
                    ))}

                    <TagManagement
                        hovered={hovered}
                        leftAligned={tags.length === 0}
                    />
                </Group>
            );
        },
    },
    {
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        size: 100,

        Cell: ({ row }) => <MetricUsageButton row={row} />,
    },
];

const UseMetricButton = ({ row }: { row: MRT_Row<CatalogField> }) => {
    const [isGeneratingPreviewUrl, setIsGeneratingPreviewUrl] = useState(false);
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const [currentTableName, setCurrentTableName] = useState<string>();
    const { track } = useTracking();
    const { isFetching } = useExplore(currentTableName, {
        onSuccess(explore) {
            if (!!currentTableName && explore && projectUuid) {
                setIsGeneratingPreviewUrl(true);
                const unsavedChartVersion =
                    createMetricPreviewUnsavedChartVersion(
                        row.original,
                        explore,
                    );

                const { pathname, search } =
                    getExplorerUrlFromCreateSavedChartVersion(
                        projectUuid,
                        unsavedChartVersion,
                    );
                const url = new URL(pathname, window.location.origin);
                url.search = new URLSearchParams(search).toString();

                window.open(url.href, '_blank');
                setIsGeneratingPreviewUrl(false);
                setCurrentTableName(undefined);
            }
        },
    });

    const handleExploreClick = () => {
        track({
            name: EventName.METRICS_CATALOG_EXPLORE_CLICKED,
            properties: {
                metricName: row.original.name,
                tableName: row.original.tableName,
            },
        });
        setCurrentTableName(row.original.tableName);
    };

    return (
        <Button
            size="xs"
            compact
            variant="subtle"
            onClick={handleExploreClick}
            loading={isFetching || isGeneratingPreviewUrl}
        >
            Explore
        </Button>
    );
};

export const MetricsTable = () => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);

    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);

    // Enable sorting by highest popularity(how many charts use the metric) by default
    const initialSorting = [
        {
            id: 'chartUsage',
            desc: true,
        },
    ];

    const [sorting, setSorting] = useState<MRT_SortingState>(initialSorting);

    const { data, fetchNextPage, hasNextPage, isFetching } = useMetricsCatalog({
        projectUuid,
        pageSize: 20,
        search: deferredSearch,
        // TODO: Handle multiple sorting - this needs to be enabled and handled later in the backend
        ...(sorting.length > 0 && {
            sortBy: sorting[0].id as keyof CatalogItem,
            sortDirection: sorting[0].desc ? 'desc' : 'asc',
        }),
    });

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    //called on scroll and possibly on mount to fetch more data as the user scrolls and reaches bottom of table
    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                //once the user has scrolled within 200px of the bottom of the table, fetch more data if we can
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

    const table = useMantineReactTable({
        columns,
        data: flatData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowActions: true,
        positionActionsColumn: 'last',
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
        mantinePaperProps: {
            shadow: undefined,
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: { maxHeight: '600px', minHeight: '600px' },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: true,
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
                // Each head row has a divider when resizing columns is enabled
                'th > div > div:last-child': {
                    width: '0.5px',
                    padding: '0px',
                },
            },
        },
        mantineSearchTextInputProps: {
            placeholder: 'Search by metric name or description',
            sx: { minWidth: '300px' },
            variant: 'default',
        },
        positionGlobalFilter: 'left',
        enableBottomToolbar: true,
        renderBottomToolbarCustomActions: () => (
            <Text>
                {isFetching
                    ? 'Loading more...'
                    : hasNextPage
                    ? `Scroll for more metrics (${flatData.length} loaded)`
                    : `All metrics loaded (${flatData.length})`}
            </Text>
        ),
        state: {
            sorting,
            showProgressBars: isFetching,
            density: undefined,
            globalFilter: search ?? '',
        },
        initialState: {
            showGlobalFilter: true, // Show search input by default
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
            },
        },
        renderRowActions: ({ row }) => <UseMetricButton row={row} />,
        enableFilterMatchHighlighting: true,
    });

    return <MantineReactTable table={table} />;
};
