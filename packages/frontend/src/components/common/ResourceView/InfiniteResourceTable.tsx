import { subject } from '@casl/ability';
import {
    assertUnreachable,
    capitalize,
    ChartSourceType,
    ContentSortByColumns,
    contentToResourceViewItem,
    ContentType,
    FeatureFlags,
    isResourceViewDataAppItem,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ApiContentBulkActionBody,
    type ResourceViewItem,
    type SpaceMemberRole,
    type SpaceSummary,
} from '@lightdash/common';
import {
    TextInput,
    Box,
    Divider,
    Group,
    Text,
    Button,
    ActionIcon,
    Anchor,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import {
    IconAppWindow,
    IconChartBar,
    IconFolder,
    IconFolderSymlink,
    IconLayoutDashboard,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
    useContentBulkAction,
    useInfiniteContent,
    type ContentArgs,
} from '../../../hooks/useContent';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import useApp from '../../../providers/App/useApp';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
    type ContentTableOptions,
    type ContentTableVirtualizer,
} from '../ContentTable';
import MantineIcon from '../MantineIcon';
import TransferItemsModal from '../TransferItemsModal/TransferItemsModal';
import { UserSelect } from '../UserSelect';
import ViewsCountPopover from '../ViewsCountPopover';
import AdminContentViewFilter, {
    type ContentViewValue,
} from './AdminContentViewFilter';
import ContentTypeFilter from './ContentTypeFilter';
import classes from './InfiniteResourceTable.module.css';
import InfiniteResourceTableColumnName from './InfiniteResourceTableColumnName';
import ResourceAccessInfo from './ResourceAccessInfo';
import ResourceActionHandlers from './ResourceActionHandlers';
import ResourceActionMenu from './ResourceActionMenu';
import AttributeCount from './ResourceAttributeCount';
import ResourceLastEdited from './ResourceLastEdited';
import { getResourceUrl, getViewStatsResourceType } from './resourceUtils';
import {
    ColumnVisibility,
    ResourceViewItemAction,
    type ColumnVisibilityConfig,
    type ResourceViewItemActionState,
} from './types';

type ResourceView2Props = Partial<ContentTableOptions<ResourceViewItem>> & {
    filters: Pick<
        ContentArgs,
        | 'spaceUuids'
        | 'contentTypes'
        | 'includePersonalDataApps'
        | 'dataAppVizsFilter'
        | 'sharedWithMe'
    > & {
        projectUuid: string;
    };
    contentTypeFilter?: {
        defaultValue: ContentType | undefined;
        options: ContentType[];
    };
    /** Show a dashboard-owner filter in the toolbar (dashboard lists only) */
    ownerFilter?: boolean;
    columnVisibility?: ColumnVisibilityConfig;
    adminContentView?: boolean;
    initialAdminContentViewValue?: 'all' | 'shared';
    /**
     * Controlled content-view toggle for the root browsing surface:
     * Spaces | Shared with me | Admin Content View. When provided it
     * replaces the uncontrolled admin-only control.
     */
    contentView?: {
        value: ContentViewValue;
        onChange: (value: ContentViewValue) => void;
        withSharedWithMe: boolean;
        withAdminView: boolean;
    };
    showDataAppVersionStatus?: boolean;
};

const defaultSpaces: SpaceSummary[] = [];

// Self-contained search input: holds the typed value locally and only lifts the
// debounced value to the parent, so keystrokes don't re-render the whole table.
const DebouncedSearchInput = memo(
    ({ onSearch }: { onSearch: (value: string) => void }) => {
        const [value, setValue] = useState('');
        const debouncedOnSearch = useDebouncedCallback(onSearch, 300);

        // Debounce typing. Clearing (empty value) flushes immediately; re-invoking
        // the debounced fn cancels any pending call so a stale keystroke can't
        // resurrect a just-cleared search.
        const handleChange = useCallback(
            (newValue: string) => {
                setValue(newValue);
                debouncedOnSearch(newValue);
                if (newValue === '') {
                    debouncedOnSearch.flush();
                }
            },
            [debouncedOnSearch],
        );

        return (
            <Tooltip label="Search by name">
                <TextInput
                    size="xs"
                    classNames={{ input: classes.searchInput }}
                    styles={(inputTheme) => ({
                        input: {
                            height: 32,
                            width: 309,
                            textOverflow: 'ellipsis',
                            fontSize: inputTheme.fontSizes.sm,
                            fontWeight: 400,
                            color: value
                                ? inputTheme.colors.ldGray[8]
                                : inputTheme.colors.ldGray[5],
                            boxShadow: inputTheme.shadows.subtle,
                        },
                    })}
                    type="search"
                    variant="default"
                    placeholder="Search by name"
                    value={value}
                    leftSection={
                        <MantineIcon
                            size="md"
                            color="dimmed"
                            icon={IconSearch}
                        />
                    }
                    onChange={(e) => handleChange(e.target.value)}
                    rightSectionPointerEvents="all"
                    rightSection={
                        value && (
                            <ActionIcon
                                aria-label="Clear search"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleChange('')}
                                variant="transparent"
                                size="xs"
                                color="ldGray.5"
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        )
                    }
                />
            </Tooltip>
        );
    },
);
DebouncedSearchInput.displayName = 'DebouncedSearchInput';

const InfiniteResourceTable = ({
    filters,
    contentTypeFilter,
    ownerFilter = false,
    columnVisibility,
    adminContentView = false,
    initialAdminContentViewValue = 'shared',
    contentView,
    showDataAppVersionStatus = false,
    ...contentTableProps
}: ResourceView2Props) => {
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? filters.projectUuid;
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
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;
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

    const ResourceColumns: ContentTableColumnDef<ResourceViewItem>[] = [
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
                        projectUrlIdentifier={projectUrlIdentifier}
                        canUserManageValidation={canUserManageValidation}
                        showDataAppVersionStatus={showDataAppVersionStatus}
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

                if (space) {
                    return (
                        <Anchor
                            c="ldGray.7"
                            component={Link}
                            to={`/projects/${projectUrlIdentifier}/spaces/${space.uuid}`}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                                e.stopPropagation()
                            }
                            fz="xs"
                            fw={500}
                        >
                            {space.name}
                        </Anchor>
                    );
                }

                // Personal (space-less) data apps have no space to link to.
                if (isResourceViewDataAppItem(item) && !item.data.spaceUuid) {
                    return (
                        <Text fz="xs" fw={500} c="dimmed">
                            -
                        </Text>
                    );
                }

                // Inaccessible parent space: real name, non-navigable.
                const inaccessibleSpaceName = item.data.spaceUuid
                    ? contentSpaceNames[item.data.spaceUuid]
                    : undefined;
                if (inaccessibleSpaceName) {
                    return (
                        <Text fz="xs" fw={500} c="ldGray.7">
                            {inaccessibleSpaceName}
                        </Text>
                    );
                }

                return null;
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
                        <Text fz="xs" fw={500} c="ldGray.7">
                            -
                        </Text>
                    );
                return <ResourceLastEdited item={row.original} />;
            },
        },
        {
            accessorKey: ColumnVisibility.OWNER,
            enableSorting: false,
            enableEditing: false,
            header: 'Owner',
            size: 160,
            Cell: ({ row }) => {
                const item = row.original;
                if (!isResourceViewItemDashboard(item) || !item.data.owner) {
                    return (
                        <Text fz="xs" fw={500} c="dimmed">
                            -
                        </Text>
                    );
                }
                const { firstName, lastName, email } = item.data.owner;
                const ownerName =
                    `${firstName} ${lastName}`.trim() || email || '-';
                return (
                    <Text fz="xs" fw={500} c="ldGray.7">
                        {ownerName}
                    </Text>
                );
            },
        },
        {
            accessorKey: ColumnVisibility.VIEWS,
            enableSorting: true,
            enableEditing: false,
            header: 'Views',
            size: 100,
            Cell: ({ row }) => {
                if (isResourceViewSpaceItem(row.original))
                    return (
                        <Text fz="xs" fw={500} c="ldGray.7">
                            -
                        </Text>
                    );
                return (
                    <ViewsCountPopover
                        resourceType={getViewStatsResourceType(row.original)}
                        resourceUuid={row.original.data.uuid}
                        projectUuid={filters.projectUuid}
                        views={row.original.data.views}
                    >
                        <Text fz="xs" fw={500} c="ldGray.7">
                            {row.original.data.views}
                        </Text>
                    </ViewsCountPopover>
                );
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
                        data: {
                            dashboardCount,
                            chartCount,
                            childSpaceCount,
                            appCount,
                        },
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
                        {dataAppsEnabled && (
                            <AttributeCount
                                Icon={IconAppWindow}
                                count={appCount}
                                name="Data apps"
                            />
                        )}
                        <AttributeCount
                            Icon={IconFolder}
                            count={childSpaceCount}
                            name="Spaces"
                        />
                    </Group>
                );
            },
        },
    ];
    const initialSorting: ContentTableSortingState = [
        {
            id: ColumnVisibility.UPDATED_AT,
            desc: true,
        },
    ];
    const [sorting, setSorting] =
        useState<ContentTableSortingState>(initialSorting);
    // Holds the debounced search value lifted from DebouncedSearchInput.
    const [search, setSearch] = useState('');
    const [selectedContentType, setSelectedContentType] = useState<
        ContentType | undefined
    >(contentTypeFilter?.defaultValue);
    const [selectedOwnerUserUuid, setSelectedOwnerUserUuid] = useState<
        string | null
    >(null);
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );
    const sortBy:
        | {
              sortBy: ContentSortByColumns;
              sortDirection: 'asc' | 'desc';
          }
        | undefined = useMemo(() => {
        if (sorting.length === 0) return undefined;

        // Sorting ids are column accessorKeys (ColumnVisibility values)
        const firstSorting = sorting[0].id;

        let sortByColumn: ContentSortByColumns =
            ContentSortByColumns.LAST_UPDATED_AT;
        const sortDirection: 'asc' | 'desc' = sorting[0].desc ? 'desc' : 'asc';

        if (firstSorting === ColumnVisibility.NAME) {
            sortByColumn = ContentSortByColumns.NAME;
        }

        if (firstSorting === ColumnVisibility.SPACE) {
            sortByColumn = ContentSortByColumns.SPACE_NAME;
        }

        if (firstSorting === ColumnVisibility.VIEWS) {
            sortByColumn = ContentSortByColumns.VIEWS;
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
                search,
                sortBy: sortBy?.sortBy,
                sortDirection: sortBy?.sortDirection,
                includePersonalDataApps: filters.includePersonalDataApps,
                dataAppVizsFilter: filters.dataAppVizsFilter,
                sharedWithMe: filters.sharedWithMe,
                ownerUserUuids: selectedOwnerUserUuid
                    ? [selectedOwnerUserUuid]
                    : undefined,
            },
            { keepPreviousData: true },
        );

    // Real parent names for rows whose space the viewer cannot access
    // (directly shared content): shown as non-navigable context.
    // Grant roles per resource: a direct grant never puts its space in the
    // viewer's space list, so the row menu cannot infer these from spaces.
    const contentGrantRoles = useMemo(() => {
        const roles: Record<string, SpaceMemberRole[]> = {};
        data?.pages.forEach((page) => {
            page.data.forEach((content) => {
                if (
                    content.contentType !== ContentType.SPACE &&
                    content.directAccessRoles.length > 0
                ) {
                    roles[content.uuid] = content.directAccessRoles;
                }
            });
        });
        return roles;
    }, [data]);

    const contentSpaceNames = useMemo(() => {
        const names: Record<string, string> = {};
        data?.pages.forEach((page) => {
            page.data.forEach((content) => {
                if (
                    content.contentType !== ContentType.SPACE &&
                    content.space
                ) {
                    names[content.space.uuid] = content.space.name;
                }
            });
        });
        return names;
    }, [data]);

    const flatData = useMemo(() => {
        if (!data || !spaces) return [];
        return data.pages
            .flatMap((page) => page.data.map(contentToResourceViewItem))
            .filter((item) => {
                if (!isResourceViewSpaceItem(item)) return true;
                if (!userCanManageProject) return true;
                if (
                    (contentView?.value ?? selectedAdminContentType) === 'all'
                ) {
                    return true;
                }

                const space = spaces.find((s) => s.uuid === item.data.uuid);
                if (!space) return false;
                return space.inheritsFromOrgOrProject || !!space.userAccess;
            });
    }, [
        data,
        userCanManageProject,
        spaces,
        selectedAdminContentType,
        contentView?.value,
    ]);

    // Temporary workaround to resolve a memoization issue with react-mantine-table.
    // In certain scenarios, the content fails to render properly even when the data is updated.
    // This issue may be addressed in a future library update.
    const [tableData, setTableData] = useState<ResourceViewItem[]>([]);
    useEffect(() => {
        setTableData(flatData);
    }, [flatData]);

    // Force virtualizer to re-measure when data changes, fixing rendering issues
    // with single items after browser back navigation
    useEffect(() => {
        if (tableData.length > 0 && rowVirtualizerInstanceRef.current) {
            requestAnimationFrame(() => {
                rowVirtualizerInstanceRef.current?.measure();
            });
        }
    }, [tableData.length]);

    const totalResults = useMemo(() => {
        if (!data) return 0;
        // Return total results from the last page, this should be the same but still we want to have the latest value
        const lastPage = data.pages[data.pages.length - 1];
        return lastPage.pagination?.totalResults ?? 0;
    }, [data]);

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: hasNextPage ?? false,
    });

    const defaultColumnVisibility = useMemo(
        () => ({
            [ColumnVisibility.NAME]: true,
            [ColumnVisibility.SPACE]: true,
            [ColumnVisibility.UPDATED_AT]: true,
            [ColumnVisibility.OWNER]: false,
            [ColumnVisibility.VIEWS]: true,
            [ColumnVisibility.ACCESS]: false,
            [ColumnVisibility.CONTENT]: false,
            ...columnVisibility,
        }),
        [columnVisibility],
    );

    const table = useContentTable({
        columns: ResourceColumns,
        data: tableData,
        getRowId: (item) => `${item.type}-${item.data.uuid}`,
        enableColumnResizing: true,
        positionActionsColumn: 'last',
        enableRowVirtualization: true,
        enablePagination: false,
        onGlobalFilterChange: (s: string) => {
            setSearch(s);
        },
        enableSorting: true,
        manualSorting: true,
        onSortingChange: setSorting,
        enableTopToolbar: true,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll,
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
                // Adding to inline styles to override the default ones which can't be overridden with sx
                style: {
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

            return {
                onClick: () => {
                    if (isTableSelectionActive) {
                        row.toggleSelected();
                    } else if (!isInitialLoading) {
                        void navigate(
                            getResourceUrl(
                                filters.projectUuid,
                                row.original,
                                projectUrlIdentifier,
                            ),
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
        renderTopToolbar: () => {
            const selectedRows = table.getFilteredSelectedRowModel().flatRows;
            const selectedItems = selectedRows.map((row) => row.original);

            return (
                <Box>
                    <Group p={`${theme.spacing.lg} ${theme.spacing.xl}`}>
                        <Group gap="xs">
                            <DebouncedSearchInput onSearch={setSearch} />

                            {contentTypeFilter &&
                            contentTypeFilter.options.length > 1 ? (
                                <>
                                    <Divider
                                        orientation="vertical"
                                        w={1}
                                        h={20}
                                        color="#DEE2E6"
                                        className="ld-self-center"
                                    />
                                    <ContentTypeFilter
                                        value={selectedContentType}
                                        onChange={setSelectedContentType}
                                        options={contentTypeFilter.options}
                                    />
                                </>
                            ) : null}

                            {contentView &&
                            (contentView.withSharedWithMe ||
                                contentView.withAdminView) ? (
                                <AdminContentViewFilter
                                    value={contentView.value}
                                    onChange={contentView.onChange}
                                    withSharedWithMe={
                                        contentView.withSharedWithMe
                                    }
                                    withAdminView={contentView.withAdminView}
                                />
                            ) : adminContentView ? (
                                <AdminContentViewFilter
                                    value={selectedAdminContentType}
                                    onChange={(value) => {
                                        if (value !== 'shared-with-me') {
                                            setSelectedAdminContentType(value);
                                        }
                                    }}
                                />
                            ) : null}

                            {ownerFilter ? (
                                <>
                                    <Divider
                                        orientation="vertical"
                                        w={1}
                                        h={20}
                                        color="#DEE2E6"
                                        className="ld-self-center"
                                    />
                                    <Box w={220}>
                                        <UserSelect
                                            placeholder="Filter by owner"
                                            value={selectedOwnerUserUuid}
                                            onChange={setSelectedOwnerUserUuid}
                                            clearable
                                        />
                                    </Box>
                                </>
                            ) : null}
                        </Group>

                        {selectedItems.length > 0 ? (
                            <Button
                                ml="auto"
                                size="xs"
                                leftSection={
                                    <MantineIcon icon={IconFolderSymlink} />
                                }
                                onClick={openTransferItemsModal}
                            >
                                Move to space
                            </Button>
                        ) : null}
                    </Group>
                    <Divider color="ldGray.2" />
                </Box>
            );
        },
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                c="ldGray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.ldGray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text fz="xs">Loading more...</Text>
                ) : (
                    <Group gap="two">
                        <Text fz="xs">
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
                        grantRoles={
                            contentGrantRoles[row.original.data.uuid] ?? []
                        }
                        onAction={handleAction}
                    />
                </Box>
            );
        },
        state: {
            sorting,
            showProgressBars: false,
            showSkeletons: isInitialLoading, // loading for the first time with no data
            density: 'md',
            globalFilter: search,
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
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 40 },
        displayColumnDefOptions: {
            'content-table-row-actions': {
                header: '',
            },
            'content-table-row-select': {
                size: 20,
                minSize: 20,
                maxSize: 20,
                enableResizing: false,
            },
        },
        enableEditing: true,
        ...contentTableProps,
        mantineSelectCheckboxProps: {
            size: 'sm',
        },
        mantineSelectAllCheckboxProps: {
            size: 'sm',
        },
    });

    const spaceUuidsKey = (filters.spaceUuids ?? []).join(',');
    useEffect(() => {
        table.resetRowSelection();
    }, [spaceUuidsKey, table]);

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
                content: selectedItems.flatMap(
                    (item): ApiContentBulkActionBody['content'] => {
                        switch (item.type) {
                            case ContentType.CHART:
                                return [
                                    {
                                        uuid: item.data.uuid,
                                        contentType: ContentType.CHART,
                                        source:
                                            item.data.source ??
                                            ChartSourceType.DBT_EXPLORE,
                                    },
                                ];
                            case ContentType.DASHBOARD:
                                return [
                                    {
                                        uuid: item.data.uuid,
                                        contentType: ContentType.DASHBOARD,
                                    },
                                ];
                            case ContentType.SPACE:
                                return [
                                    {
                                        uuid: item.data.uuid,
                                        contentType: ContentType.SPACE,
                                    },
                                ];
                            case ContentType.DATA_APP:
                                return [
                                    {
                                        uuid: item.data.uuid,
                                        contentType: ContentType.DATA_APP,
                                    },
                                ];
                            default:
                                return assertUnreachable(
                                    item,
                                    'Invalid item type in bulk move handler',
                                );
                        }
                    },
                ),
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
            <ContentTable table={table} />
            <ResourceActionHandlers action={action} onAction={handleAction} />

            {isTransferItemsModalOpen && (
                <TransferItemsModal
                    opened
                    onClose={closeTransferItemsModal}
                    projectUuid={filters.projectUuid}
                    items={selectedItems}
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
