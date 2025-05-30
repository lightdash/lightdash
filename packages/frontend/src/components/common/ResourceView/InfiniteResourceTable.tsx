import { subject } from '@casl/ability';
import {
    assertUnreachable,
    capitalize,
    ChartSourceType,
    ContentSortByColumns,
    contentToResourceViewItem,
    ContentType,
    isResourceViewSpaceItem,
    type ResourceViewItem,
    type SpaceSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowsSort,
    IconArrowUp,
    IconChartBar,
    IconFolderSymlink,
    IconLayoutDashboard,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
    type MRT_SortingState,
    type MRT_TableOptions,
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
import { Link, useNavigate } from 'react-router';
import {
    useContentBulkAction,
    useInfiniteContent,
    type ContentArgs,
} from '../../../hooks/useContent';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import AdminContentViewFilter from './AdminContentViewFilter';
import ContentTypeFilter from './ContentTypeFilter';
import InfiniteResourceTableColumnName from './InfiniteResourceTableColumnName';
import ResourceAccessInfo from './ResourceAccessInfo';
import ResourceActionHandlers from './ResourceActionHandlers';
import ResourceActionMenu from './ResourceActionMenu';
import AttributeCount from './ResourceAttributeCount';
import ResourceLastEdited from './ResourceLastEdited';
import { getResourceUrl } from './resourceUtils';
import {
    ColumnVisibility,
    ResourceViewItemAction,
    type ColumnVisibilityConfig,
    type ResourceViewItemActionState,
} from './types';

type ResourceView2Props = Partial<MRT_TableOptions<ResourceViewItem>> & {
    filters: Pick<ContentArgs, 'spaceUuids' | 'contentTypes'> & {
        projectUuid: string;
    };
    contentTypeFilter?: {
        defaultValue: ContentType | undefined;
        options: ContentType[];
    };
    columnVisibility?: ColumnVisibilityConfig;
    adminContentView?: boolean;
    initialAdminContentViewValue?: 'all' | 'shared';
};

const defaultSpaces: SpaceSummary[] = [];

const InfiniteResourceTable = ({
    filters,
    contentTypeFilter,
    columnVisibility,
    adminContentView = false,
    initialAdminContentViewValue = 'shared',
    ...mrtProps
}: ResourceView2Props) => {
    const [selectedAdminContentType, setSelectedAdminContentType] = useState<
        'all' | 'shared'
    >(initialAdminContentViewValue);
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { data: spaces = defaultSpaces } = useSpaceSummaries(
        filters.projectUuid,
        true,
    );
    const { user } = useApp();

    const [
        isTransferItemsModalOpen,
        { open: openTransferItemsModal, close: closeTransferItemsModal },
    ] = useDisclosure(false);

    const canUserManageValidation = useValidationUserAbility(
        filters.projectUuid,
    );
    const [action, setAction] = useState<ResourceViewItemActionState>({
        type: ResourceViewItemAction.CLOSE,
    });
    const handleAction = useCallback(
        (newAction: ResourceViewItemActionState) => {
            setAction(newAction);
        },
        [],
    );

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: filters.projectUuid,
        }),
    );

    const ResourceColumns: MRT_ColumnDef<ResourceViewItem>[] = [
        {
            accessorKey: ColumnVisibility.NAME,
            header: capitalize(ColumnVisibility.NAME),
            enableSorting: true,
            enableEditing: false,
            size: 300,
            Cell: ({ row }) => {
                return (
                    <InfiniteResourceTableColumnName
                        item={row.original}
                        projectUuid={filters.projectUuid}
                        canUserManageValidation={canUserManageValidation}
                    />
                );
            },
        },
        {
            accessorKey: ColumnVisibility.SPACE,
            enableSorting: true,
            enableEditing: false,
            header: capitalize(ColumnVisibility.SPACE),
            Cell: ({ row }) => {
                const item = row.original;
                if (isResourceViewSpaceItem(item)) {
                    return null;
                }

                const space = spaces.find(
                    (s) => s.uuid === item.data.spaceUuid,
                );

                return space ? (
                    <Anchor
                        color="gray.7"
                        component={Link}
                        to={`/projects/${space.projectUuid}/spaces/${space.uuid}`}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                            e.stopPropagation()
                        }
                        fz={12}
                        fw={500}
                    >
                        {space.name}
                    </Anchor>
                ) : null;
            },
        },
        {
            accessorKey: ColumnVisibility.UPDATED_AT,
            enableSorting: true,
            enableEditing: false,
            header: 'Last Modified',
            Cell: ({ row }) => {
                if (isResourceViewSpaceItem(row.original))
                    return (
                        <Text fz={12} fw={500} color="gray.7">
                            -
                        </Text>
                    );
                return <ResourceLastEdited item={row.original} />;
            },
        },
        {
            accessorKey: ColumnVisibility.ACCESS,
            enableSorting: false,
            enableEditing: false,
            header: 'Access',
            Cell: ({ row }) => {
                if (!isResourceViewSpaceItem(row.original)) return null;
                return (
                    <ResourceAccessInfo
                        item={row.original}
                        type="primary"
                        withTooltip
                    />
                );
            },
        },
        {
            accessorKey: ColumnVisibility.CONTENT,
            enableSorting: false,
            enableEditing: false,
            header: 'Content',
            Cell: ({ row }) => {
                if (!isResourceViewSpaceItem(row.original)) return null;
                const {
                    original: {
                        data: { dashboardCount, chartCount },
                    },
                } = row;
                return (
                    <Group>
                        <AttributeCount
                            Icon={IconLayoutDashboard}
                            count={dashboardCount}
                            name="Dashboards"
                        />
                        <AttributeCount
                            Icon={IconChartBar}
                            count={chartCount}
                            name="Charts"
                        />
                    </Group>
                );
            },
        },
    ];
    const initialSorting: MRT_SortingState = [
        {
            id: ContentSortByColumns.LAST_UPDATED_AT,
            desc: true,
        },
    ];
    const [sorting, setSorting] = useState<MRT_SortingState>(initialSorting);
    const [search, setSearch] = useState<string | undefined>(undefined);
    const [selectedContentType, setSelectedContentType] = useState<
        ContentType | undefined
    >(contentTypeFilter?.defaultValue);
    const clearSearch = useCallback(() => setSearch(''), [setSearch]);
    const deferredSearch = useDeferredValue(search);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const rowVirtualizerInstanceRef =
        useRef<MRT_Virtualizer<HTMLDivElement, HTMLTableRowElement>>(null);
    const sortBy:
        | {
              sortBy: ContentSortByColumns;
              sortDirection: 'asc' | 'desc';
          }
        | undefined = useMemo(() => {
        if (sorting.length === 0) return undefined;

        const firstSorting = sorting[0].id;

        let sortByColumn: ContentSortByColumns =
            ContentSortByColumns.LAST_UPDATED_AT;
        const sortDirection: 'asc' | 'desc' = sorting[0].desc ? 'desc' : 'asc';

        if (firstSorting === ContentSortByColumns.NAME) {
            sortByColumn = ContentSortByColumns.NAME;
        }

        if (firstSorting === ContentSortByColumns.SPACE_NAME) {
            sortByColumn = ContentSortByColumns.SPACE_NAME;
        }

        return {
            sortBy: sortByColumn,
            sortDirection,
        };
    }, [sorting]);

    const { data, isInitialLoading, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteContent(
            {
                spaceUuids: filters.spaceUuids,
                contentTypes: selectedContentType
                    ? [selectedContentType]
                    : filters.contentTypes,
                projectUuids: [filters.projectUuid],
                page: 1,
                pageSize: 25,
                search: deferredSearch,
                sortBy: sortBy?.sortBy,
                sortDirection: sortBy?.sortDirection,
            },
            { keepPreviousData: true },
        );

    const flatData = useMemo(() => {
        if (!data || !spaces) return [];
        return data.pages
            .flatMap((page) => page.data.map(contentToResourceViewItem))
            .filter((item) => {
                if (!isResourceViewSpaceItem(item)) return true;
                if (!userCanManageProject) return true;
                if (selectedAdminContentType === 'all') return true;

                const space = spaces.find((s) => s.uuid === item.data.uuid);
                if (!space) return false;
                return !space.isPrivate || space.userAccess?.hasDirectAccess;
            });
    }, [data, userCanManageProject, spaces, selectedAdminContentType]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<ResourceViewItem[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        // Return total results from the last page, this should be the same but still we want to have the latest value
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

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

    const defaultColumnVisibility = useMemo(
        () => ({
            [ColumnVisibility.NAME]: true,
            [ColumnVisibility.SPACE]: true,
            [ColumnVisibility.UPDATED_AT]: true,
            [ColumnVisibility.ACCESS]: false,
            [ColumnVisibility.CONTENT]: false,
            ...columnVisibility,
        }),
        [columnVisibility],
    );

    const table = useMantineReactTable({
        columns: ResourceColumns,
        data: tableData,
        enableColumnResizing: true,
        enableRowNumbers: false,
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
        positionGlobalFilter: 'left',
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.spacing.sm, // ! radius doesn't have rem(12) -> 0.75rem
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

                // Each head row has a divider when resizing columns is enabled
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
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
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

                    'tr > th:last-of-type': {
                        borderLeft: `2px solid ${theme.colors.blue[3]}`,
                    },
                    '&:hover': canResize
                        ? {
                              borderRight: !isAnyColumnResizing
                                  ? `2px solid ${theme.colors.blue[3]} !important` // This is needed to override the default inline styles
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
            const isTableSelectionActive =
                table.getIsSomeRowsSelected() || table.getIsAllRowsSelected();
            const isSelected = row.getIsSelected();

            return {
                sx: {
                    cursor: 'pointer',
                    'td:first-of-type > div > .explore-button-container': {
                        visibility: 'hidden',
                        opacity: 0,
                    },
                    '&:hover': {
                        td: {
                            backgroundColor: isSelected
                                ? theme.colors.blue[1]
                                : theme.colors.gray[0],
                            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                        },

                        'td:first-of-type > div > .explore-button-container': {
                            visibility: 'visible',
                            opacity: 1,
                            transition: `visibility 0ms, opacity ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                        },
                    },
                },

                onClick: () => {
                    if (isTableSelectionActive) {
                        row.toggleSelected();
                    } else {
                        void navigate(
                            getResourceUrl(filters.projectUuid, row.original),
                        );
                    }
                },
            };
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 72,
                // Adding to inline styles to override the default ones which can't be overridden with sx
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
        renderTopToolbar: () => {
            const selectedRows = table.getFilteredSelectedRowModel().flatRows;
            const selectedItems = selectedRows.map((row) => row.original);

            return (
                <Box>
                    <Group p={`${theme.spacing.lg} ${theme.spacing.xl}`}>
                        <Group spacing="xs">
                            <Tooltip
                                withinPortal
                                variant="xs"
                                label="Search by name"
                            >
                                {/* Search input */}
                                <TextInput
                                    size="xs"
                                    radius="md"
                                    styles={(inputTheme) => ({
                                        input: {
                                            height: 32,
                                            width: 309,
                                            padding: `${inputTheme.spacing.xs} ${inputTheme.spacing.sm}`,
                                            textOverflow: 'ellipsis',
                                            fontSize: inputTheme.fontSizes.sm,
                                            fontWeight: 400,
                                            color: search
                                                ? inputTheme.colors.gray[8]
                                                : inputTheme.colors.gray[5],
                                            boxShadow:
                                                inputTheme.shadows.subtle,
                                            border: `1px solid ${inputTheme.colors.gray[3]}`,
                                            '&:hover': {
                                                border: `1px solid ${inputTheme.colors.gray[4]}`,
                                            },
                                            '&:focus': {
                                                border: `1px solid ${inputTheme.colors.blue[5]}`,
                                            },
                                        },
                                    })}
                                    type="search"
                                    variant="default"
                                    placeholder="Search by name"
                                    value={search ?? ''}
                                    icon={
                                        <MantineIcon
                                            size="md"
                                            color="gray.6"
                                            icon={IconSearch}
                                        />
                                    }
                                    onChange={(e) => setSearch(e.target.value)}
                                    rightSection={
                                        search && (
                                            <ActionIcon
                                                onClick={clearSearch}
                                                variant="transparent"
                                                size="xs"
                                                color="gray.5"
                                            >
                                                <MantineIcon icon={IconX} />
                                            </ActionIcon>
                                        )
                                    }
                                />
                            </Tooltip>

                            {contentTypeFilter &&
                            contentTypeFilter.options.length > 1 ? (
                                <>
                                    <Divider
                                        orientation="vertical"
                                        w={1}
                                        h={20}
                                        sx={{
                                            alignSelf: 'center',
                                            borderColor: '#DEE2E6',
                                        }}
                                    />
                                    <ContentTypeFilter
                                        value={selectedContentType}
                                        onChange={setSelectedContentType}
                                        options={contentTypeFilter.options}
                                    />
                                </>
                            ) : null}

                            {adminContentView ? (
                                <AdminContentViewFilter
                                    value={selectedAdminContentType}
                                    onChange={setSelectedAdminContentType}
                                />
                            ) : null}
                        </Group>

                        {selectedItems.length > 0 ? (
                            <Button
                                ml="auto"
                                variant="filled"
                                size="xs"
                                color="blue"
                                leftIcon={
                                    <MantineIcon icon={IconFolderSymlink} />
                                }
                                onClick={openTransferItemsModal}
                            >
                                Move to space
                            </Button>
                        ) : null}
                    </Group>
                    <Divider color="gray.2" />
                </Box>
            );
        },
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                color="gray.8"
                sx={{
                    borderTop: `1px solid ${theme.colors.gray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text>Loading more...</Text>
                ) : (
                    <Group spacing="two">
                        <Text>
                            {hasNextPage
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fw={400} color="gray.6">
                            {hasNextPage
                                ? `(${flatData.length} of ${totalResults} loaded)`
                                : `(${flatData.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
        enableRowActions: true,
        renderRowActions: ({ row, table: tableInstance }) => {
            /**
             * NOTE: TanStack selection API has some nuanced behavior:
             * - getIsSomeRowsSelected() - Not used here. It should return true if any row is selected,
             *   though it also returns false if all rows are selected.
             * - getIsSomePageRowsSelected() - Returns true when some rows on the current page are selected,
             *   but according to our testing, returns false if ALL rows are selected.
             * To work around this issue, we use it in combination with `getIsAllPageRowsSelected()`.
             */
            const isSelected =
                tableInstance.getIsSomePageRowsSelected() ||
                tableInstance.getIsAllPageRowsSelected();

            return (
                <Box
                    component="div"
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    <ResourceActionMenu
                        disabled={isSelected}
                        item={row.original}
                        onAction={handleAction}
                    />
                </Box>
            );
        },
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
            showSkeletons: isInitialLoading, // loading for the first time with no data
            density: 'md',
            globalFilter: search ?? '',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
        initialState: {
            showGlobalFilter: true, // Show search input by default
            columnVisibility: defaultColumnVisibility,
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
            },
            'mrt-row-select': {
                size: 20,
                minSize: 20,
                maxSize: 20,
                enableResizing: false,
            },
        },
        enableFilterMatchHighlighting: true,
        enableEditing: true,
        editDisplayMode: 'cell',
        ...mrtProps,
        mantineSelectCheckboxProps: {
            size: 'sm',
        },
        mantineSelectAllCheckboxProps: {
            size: 'sm',
        },
    });

    const {
        mutateAsync: contentBulkAction,
        isLoading: isContentBulkActionLoading,
    } = useContentBulkAction(filters.projectUuid);

    const handleBulkMoveContent = useCallback(
        async (selectedItems: ResourceViewItem[], spaceUuid: string | null) => {
            await contentBulkAction({
                action: {
                    type: 'move',
                    targetSpaceUuid: spaceUuid,
                },
                content: selectedItems.map((item) => {
                    switch (item.type) {
                        case ContentType.CHART:
                            return {
                                uuid: item.data.uuid,
                                contentType: ContentType.CHART,
                                source:
                                    item.data.source ??
                                    ChartSourceType.DBT_EXPLORE,
                            };
                        case ContentType.DASHBOARD:
                            return {
                                uuid: item.data.uuid,
                                contentType: ContentType.DASHBOARD,
                            };
                        case ContentType.SPACE:
                            return {
                                uuid: item.data.uuid,
                                contentType: ContentType.SPACE,
                            };
                        default:
                            return assertUnreachable(
                                item,
                                'Invalid item type in bulk move handler',
                            );
                    }
                }),
            });

            table.resetRowSelection();
            closeTransferItemsModal();
        },
        [closeTransferItemsModal, contentBulkAction, table],
    );

    const selectedItems = table
        .getFilteredSelectedRowModel()
        .flatRows.map((row) => row.original);

    return (
        <>
            <MantineReactTable table={table} />
            <ResourceActionHandlers action={action} onAction={handleAction} />

            {isTransferItemsModalOpen && (
                <TransferItemsModal
                    opened
                    onClose={closeTransferItemsModal}
                    projectUuid={filters.projectUuid}
                    items={selectedItems}
                    spaces={spaces}
                    isLoading={isFetching || isContentBulkActionLoading}
                    onConfirm={async (spaceUuid) => {
                        await handleBulkMoveContent(selectedItems, spaceUuid);
                    }}
                />
            )}
        </>
    );
};

export default InfiniteResourceTable;
