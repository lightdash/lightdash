import {
    ContentSortByColumns,
    contentToResourceViewItem,
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ContentType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconArrowDown,
    IconArrowUp,
    IconArrowsSort,
    IconSearch,
    IconX,
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
import { Link, useNavigate } from 'react-router';
import {
    useInfiniteContent,
    type ContentArgs,
} from '../../../hooks/useContent';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import MantineIcon from '../MantineIcon';
import { ResourceIcon, ResourceIndicator } from '../ResourceIcon';
import { ResourceInfoPopup } from '../ResourceInfoPopup/ResourceInfoPopup';
import ContentTypeFilter from './ContentTypeFilter';
import ResourceActionHandlers from './ResourceActionHandlers';
import ResourceActionMenu from './ResourceActionMenu';
import ResourceLastEdited from './ResourceLastEdited';
import {
    getResourceTypeName,
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
} from './resourceUtils';
import {
    ResourceViewItemAction,
    type ResourceViewItemActionState,
} from './types';

type ResourceView2Props = {
    filters: Pick<ContentArgs, 'spaceUuids' | 'contentTypes'> & {
        projectUuid: string;
    };
    contentTypeFilter?: {
        defaultValue: ContentType | undefined;
        options: ContentType[];
    };
};

const InfiniteResourceTable = ({
    filters,
    contentTypeFilter,
}: ResourceView2Props) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { data: spaces = [] } = useSpaceSummaries(
        filters.projectUuid,
        true,
        {},
    );
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

    const ResourceColumns: MRT_ColumnDef<ResourceViewItem>[] = [
        {
            accessorKey: 'name',
            header: 'Name',
            enableSorting: true,
            enableEditing: false,
            size: 300,
            Cell: ({ row }) => {
                const item = row.original;
                const canBelongToSpace =
                    isResourceViewItemChart(item) ||
                    isResourceViewItemDashboard(item);

                return (
                    <Anchor
                        component={Link}
                        sx={{
                            color: 'unset',
                            ':hover': {
                                color: 'unset',
                                textDecoration: 'none',
                            },
                        }}
                        to={getResourceUrl(filters.projectUuid, item)}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                            e.stopPropagation()
                        }
                    >
                        <Group noWrap>
                            {canBelongToSpace &&
                            item.data.validationErrors?.length ? (
                                <ResourceIndicator
                                    iconProps={{
                                        icon: IconAlertTriangleFilled,
                                        color: 'red',
                                    }}
                                    tooltipProps={{
                                        maw: 300,
                                        withinPortal: true,
                                        multiline: true,
                                        offset: -2,
                                        position: 'bottom',
                                    }}
                                    tooltipLabel={
                                        canUserManageValidation ? (
                                            <>
                                                This content is broken. Learn
                                                more about the validation
                                                error(s){' '}
                                                <Anchor
                                                    component={Link}
                                                    fw={600}
                                                    to={{
                                                        pathname: `/generalSettings/projectManagement/${filters.projectUuid}/validator`,
                                                        search: `?validationId=${item.data.validationErrors[0].validationId}`,
                                                    }}
                                                    color="blue.4"
                                                >
                                                    here
                                                </Anchor>
                                                .
                                            </>
                                        ) : (
                                            <>
                                                There's an error with this{' '}
                                                {isResourceViewItemChart(item)
                                                    ? 'chart'
                                                    : 'dashboard'}
                                                .
                                            </>
                                        )
                                    }
                                >
                                    <ResourceIcon item={item} />
                                </ResourceIndicator>
                            ) : (
                                <ResourceIcon item={item} />
                            )}

                            <Stack spacing={2}>
                                <Group spacing="xs" noWrap>
                                    <Text
                                        fw={600}
                                        lineClamp={1}
                                        sx={{ overflowWrap: 'anywhere' }}
                                    >
                                        {item.data.name}
                                    </Text>
                                    {!isResourceViewSpaceItem(item) &&
                                        // If there is no description, don't show the info icon on dashboards.
                                        // For charts we still show it for the dashboard list
                                        (item.data.description ||
                                            isResourceViewItemChart(item)) &&
                                        canBelongToSpace && (
                                            <Box>
                                                <ResourceInfoPopup
                                                    resourceUuid={
                                                        item.data.uuid
                                                    }
                                                    projectUuid={
                                                        filters.projectUuid
                                                    }
                                                    description={
                                                        item.data.description
                                                    }
                                                    withChartData={isResourceViewItemChart(
                                                        item,
                                                    )}
                                                />
                                            </Box>
                                        )}
                                </Group>
                                {canBelongToSpace && (
                                    <Text fz={12} color="gray.6">
                                        {getResourceTypeName(item)} •{' '}
                                        <Tooltip
                                            position="top-start"
                                            disabled={
                                                !item.data.views ||
                                                !item.data.firstViewedAt
                                            }
                                            label={getResourceViewsSinceWhenDescription(
                                                item,
                                            )}
                                        >
                                            <span>
                                                {item.data.views || '0'} views
                                            </span>
                                        </Tooltip>
                                    </Text>
                                )}
                            </Stack>
                        </Group>
                    </Anchor>
                );
            },
        },
        {
            accessorKey: 'space',
            enableSorting: true,
            enableEditing: false,
            header: 'Space',
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
            accessorKey: 'updatedAt',
            enableSorting: true,
            enableEditing: false,
            header: 'Last Edited',
            Cell: ({ row }) => {
                if (isResourceViewSpaceItem(row.original)) return null;
                return <ResourceLastEdited item={row.original} />;
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
                ...(sorting.length > 0 && {
                    sortBy:
                        sorting[0].id === 'name'
                            ? ContentSortByColumns.NAME
                            : sorting[0].id === 'space'
                            ? ContentSortByColumns.SPACE_NAME
                            : ContentSortByColumns.LAST_UPDATED_AT,
                    sortDirection: sorting[0].desc ? 'desc' : 'asc',
                }),
            },
            { keepPreviousData: true },
        );

    const flatData = useMemo(() => {
        if (!data) return [];
        return data.pages.flatMap((page) =>
            page.data.map(contentToResourceViewItem),
        );
    }, [data]);

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
        mantineTableHeadProps: {
            sx: {
                flexShrink: 1,
            },
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',

                // Each head row has a divider when resizing columns is enabled
                'th > div > div:last-child': {
                    height: 40,
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
                    '&:hover': {
                        borderRight: !isAnyColumnResizing
                            ? `2px solid ${theme.colors.blue[3]} !important` // This is needed to override the default inline styles
                            : undefined,
                        transition: `border-right ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                    },
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
        mantineTableBodyRowProps: ({ row }) => ({
            sx: {
                cursor: isResourceViewSpaceItem(row.original)
                    ? undefined
                    : 'pointer',
                'td:first-of-type > div > .explore-button-container': {
                    visibility: 'hidden',
                    opacity: 0,
                },
                '&:hover': {
                    td: {
                        backgroundColor: theme.colors.gray[0],
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
                if (isResourceViewSpaceItem(row.original)) {
                    return;
                }

                void navigate(
                    getResourceUrl(filters.projectUuid, row.original),
                );
            },
        }),
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
        renderTopToolbar: () => (
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
                                        boxShadow: inputTheme.shadows.subtle,
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
                        {contentTypeFilter && (
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
                                    options={contentTypeFilter?.options}
                                />
                            </>
                        )}
                    </Group>
                </Group>
                <Divider color="gray.2" />
            </Box>
        ),
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
        renderRowActions: ({ row }) => (
            <Box
                component="div"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <ResourceActionMenu
                    item={row.original}
                    onAction={handleAction}
                />
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
            columnVisibility: {
                categories: false,
            },
        },
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { overscan: 40 },
        displayColumnDefOptions: {
            'mrt-row-actions': {
                header: '',
            },
        },
        enableFilterMatchHighlighting: true,
        enableEditing: true,
        editDisplayMode: 'cell',
    });

    return (
        <>
            <MantineReactTable table={table} />
            <ResourceActionHandlers action={action} onAction={handleAction} />
        </>
    );
};

export default InfiniteResourceTable;
