import {
    assertUnreachable,
    ChartSourceType,
    ContentType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    type DataAppVizsFilter,
    type DeletedContentWithDescendants,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Group,
    Text,
    TextInput,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAppWindow,
    IconCalendar,
    IconClock,
    IconFolder,
    IconLayoutDashboard,
    IconPuzzle,
    IconRefresh,
    IconSearch,
    IconTextCaption,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableVirtualizer,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import { ChartIcon, IconBox } from '../../../components/common/ResourceIcon';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import {
    useInfiniteDeletedContent,
    usePermanentlyDeleteContent,
    useRestoreDeletedContent,
} from '../hooks/useDeletedContent';
import { useDeletedContentFilters } from '../hooks/useDeletedContentFilters';
import {
    CHART_TYPES_FILTER_VALUE,
    type DeletedContentTypeFilter,
} from '../types';
import { ContentTypeFilter } from './ContentTypeFilter';
import { DeletedByFilter } from './DeletedByFilter';
import DeletedContentActionMenu from './DeletedContentActionMenu';

function getDeletedContentDescription(
    item: DeletedContentWithDescendants,
    dataAppsEnabled: boolean,
): string | null {
    const parts: string[] = [];
    if (item.contentType === ContentType.SPACE) {
        if (item.nestedSpaceCount > 0)
            parts.push(
                `${item.nestedSpaceCount} space${item.nestedSpaceCount !== 1 ? 's' : ''}`,
            );
        if (item.dashboardCount > 0)
            parts.push(
                `${item.dashboardCount} dashboard${item.dashboardCount !== 1 ? 's' : ''}`,
            );
        if (item.chartCount > 0)
            parts.push(
                `${item.chartCount} chart${item.chartCount !== 1 ? 's' : ''}`,
            );
        if (dataAppsEnabled && item.appCount > 0)
            parts.push(
                `${item.appCount} data app${item.appCount !== 1 ? 's' : ''}`,
            );
        if (item.schedulerCount > 0)
            parts.push(
                `${item.schedulerCount} scheduled deliver${item.schedulerCount !== 1 ? 'ies' : 'y'}`,
            );
    } else if (item.contentType === ContentType.DASHBOARD) {
        if (item.chartCount > 0)
            parts.push(
                `${item.chartCount} chart${item.chartCount !== 1 ? 's' : ''}`,
            );
        if (item.schedulerCount > 0)
            parts.push(
                `${item.schedulerCount} scheduled deliver${item.schedulerCount !== 1 ? 'ies' : 'y'}`,
            );
    } else if (
        item.contentType === ContentType.CHART &&
        item.source === ChartSourceType.DBT_EXPLORE
    ) {
        if (item.schedulerCount > 0)
            parts.push(
                `${item.schedulerCount} scheduled deliver${item.schedulerCount !== 1 ? 'ies' : 'y'}`,
            );
    }
    return parts.length > 0 ? `Contains ${parts.join(', ')}` : null;
}

interface Props {
    projectUuid: string;
}

const FETCH_SIZE = 50;

const formatDaysRemaining = (
    deletedAt: Date,
    retentionDays: number,
): string => {
    const deletedDate = new Date(deletedAt);
    const now = new Date();
    const diffDays = Math.ceil(
        (deletedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) +
            retentionDays,
    );
    if (diffDays <= 0) return 'Expired';
    if (diffDays === 1) return '1 day';
    return `${diffDays} days`;
};

const RecentlyDeletedPage: FC<Props> = ({ projectUuid }) => {
    const theme = useMantineTheme();
    const rowVirtualizerInstanceRef =
        useRef<ContentTableVirtualizer<HTMLDivElement, HTMLTableRowElement>>(
            null,
        );

    const { health, user } = useApp();
    const retentionDays = health.data?.softDelete.retentionDays;
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled ?? false;

    const [selectedContentType, setSelectedContentType] =
        useState<DeletedContentTypeFilter>('all');

    const {
        search,
        setSearch,
        selectedDeletedByUserUuids,
        setSelectedDeletedByUserUuids,
        apiFilters,
    } = useDeletedContentFilters();

    // Debounce filters
    const debouncedFilters = useMemo(() => {
        return { search, apiFilters, selectedContentType };
    }, [search, apiFilters, selectedContentType]);

    const [debouncedSearchAndFilters] = useDebouncedValue(
        debouncedFilters,
        300,
    );

    // Convert selectedContentType to array format for API. Custom chart
    // types share ContentType.DATA_APP; the dataAppVizsFilter splits them.
    const contentTypesFilter = useMemo(() => {
        const selected = debouncedSearchAndFilters.selectedContentType;
        if (selected === 'all') {
            return debouncedSearchAndFilters.apiFilters.contentTypes;
        }
        if (selected === CHART_TYPES_FILTER_VALUE) {
            return [ContentType.DATA_APP];
        }
        return [selected];
    }, [debouncedSearchAndFilters]);

    const dataAppVizsFilter = useMemo<DataAppVizsFilter | undefined>(() => {
        switch (debouncedSearchAndFilters.selectedContentType) {
            case ContentType.DATA_APP:
                return 'exclude';
            case CHART_TYPES_FILTER_VALUE:
                return 'only';
            default:
                return undefined;
        }
    }, [debouncedSearchAndFilters]);

    const { data, fetchNextPage, isError, isFetching, isLoading, refetch } =
        useInfiniteDeletedContent({
            projectUuids: [projectUuid],
            pageSize: FETCH_SIZE,
            search: debouncedSearchAndFilters.search,
            contentTypes: contentTypesFilter,
            deletedByUserUuids:
                debouncedSearchAndFilters.apiFilters.deletedByUserUuids,
            dataAppVizsFilter,
        });

    const flatData = useMemo<DeletedContentWithDescendants[]>(
        () => data?.pages?.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    const { mutate: restoreContent, isLoading: isRestoring } =
        useRestoreDeletedContent(projectUuid);
    const { mutate: permanentlyDelete, isLoading: isDeleting } =
        usePermanentlyDeleteContent(projectUuid);

    const isAdmin = user.data?.ability?.can('manage', 'Organization') ?? false;

    const {
        containerRef: tableContainerRef,
        onScroll,
        scrollToTop,
    } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    // Scroll to top when filters change
    useEffect(() => {
        scrollToTop();
    }, [debouncedSearchAndFilters, scrollToTop]);

    const columns = useMemo<
        ContentTableColumnDef<DeletedContentWithDescendants>[]
    >(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTextCaption} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const resourceIcon = (() => {
                        switch (row.original.contentType) {
                            case ContentType.CHART:
                                return (
                                    <ChartIcon
                                        chartKind={
                                            row.original.chartKind ?? undefined
                                        }
                                    />
                                );
                            case ContentType.DASHBOARD:
                                return (
                                    <IconBox
                                        icon={IconLayoutDashboard}
                                        color="green.6"
                                    />
                                );
                            case ContentType.SPACE:
                                return (
                                    <IconBox
                                        icon={IconFolder}
                                        color="violet.6"
                                    />
                                );
                            case ContentType.DATA_APP:
                                // Custom chart types share the content type;
                                // give them their own icon so rows read right.
                                return row.original.template ===
                                    DATA_APP_VIZ_TEMPLATE ? (
                                    <IconBox
                                        icon={IconPuzzle}
                                        color="indigo.6"
                                    />
                                ) : (
                                    <IconBox
                                        icon={IconAppWindow}
                                        color="orange.6"
                                    />
                                );
                            default:
                                return assertUnreachable(
                                    row.original,
                                    `Unknown content type`,
                                );
                        }
                    })();
                    const description = getDeletedContentDescription(
                        row.original,
                        dataAppsEnabled,
                    );
                    return (
                        <Group gap="sm" wrap="nowrap">
                            {resourceIcon}
                            <Box>
                                <Text fw={600} fz="sm" lineClamp={1}>
                                    {row.original.name}
                                </Text>
                                {description && (
                                    <Text fz="xs" c="dimmed" lineClamp={1}>
                                        {description}
                                    </Text>
                                )}
                            </Box>
                        </Group>
                    );
                },
            },
            ...(isAdmin
                ? [
                      {
                          accessorKey: 'deletedBy',
                          header: 'Deleted by',
                          size: 150,
                          Header: ({
                              column,
                          }: {
                              column: { columnDef: { header: string } };
                          }) => (
                              <Group gap="two" wrap="nowrap">
                                  <MantineIcon icon={IconUser} color="dimmed" />
                                  {column.columnDef.header}
                              </Group>
                          ),
                          Cell: ({
                              row,
                          }: {
                              row: { original: DeletedContentWithDescendants };
                          }) =>
                              row.original.deletedBy ? (
                                  <Text fz="xs" c="dimmed">
                                      {row.original.deletedBy.firstName}{' '}
                                      {row.original.deletedBy.lastName}
                                  </Text>
                              ) : (
                                  <Text fz="xs" c="dimmed">
                                      Unknown
                                  </Text>
                              ),
                      } as ContentTableColumnDef<DeletedContentWithDescendants>,
                  ]
                : []),
            {
                accessorKey: 'deletedAt',
                header: 'Deleted',
                size: 130,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconCalendar} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="xs" c="dimmed">
                        {new Date(row.original.deletedAt).toLocaleDateString()}
                    </Text>
                ),
            },
            {
                id: 'daysRemaining',
                header: 'Days remaining',
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const remaining = formatDaysRemaining(
                        row.original.deletedAt,
                        retentionDays ?? 0,
                    );
                    const isExpired = remaining === 'Expired';
                    return (
                        <Text fz="xs" c={isExpired ? 'red' : 'ldGray.6'}>
                            {remaining}
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                size: 50,
                enableResizing: false,
                Cell: ({ row }) => (
                    <Box
                        component="div"
                        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        <DeletedContentActionMenu
                            item={row.original}
                            onRestore={() => {
                                const item = row.original;
                                switch (item.contentType) {
                                    case ContentType.CHART:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                            source: item.source,
                                        });
                                        break;
                                    case ContentType.DASHBOARD:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.SPACE:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.DATA_APP:
                                        restoreContent({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                            isChartType:
                                                item.template ===
                                                DATA_APP_VIZ_TEMPLATE,
                                        });
                                        break;
                                    default:
                                        assertUnreachable(
                                            item,
                                            `Unknown content type`,
                                        );
                                }
                            }}
                            onPermanentlyDelete={() => {
                                const item = row.original;
                                switch (item.contentType) {
                                    case ContentType.CHART:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                            source: item.source,
                                        });
                                        break;
                                    case ContentType.DASHBOARD:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.SPACE:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    case ContentType.DATA_APP:
                                        permanentlyDelete({
                                            uuid: item.uuid,
                                            contentType: item.contentType,
                                        });
                                        break;
                                    default:
                                        assertUnreachable(
                                            item,
                                            `Unknown content type`,
                                        );
                                }
                            }}
                            isLoading={isRestoring || isDeleting}
                        />
                    </Box>
                ),
            },
        ],
        [
            isAdmin,
            retentionDays,
            restoreContent,
            permanentlyDelete,
            isRestoring,
            isDeleting,
            dataAppsEnabled,
        ],
    );

    const table = useContentTable({
        columns,
        data: flatData,
        enableColumnResizing: true,
        enablePagination: false,
        enableSorting: false,
        enableRowVirtualization: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
        },
        mantineTableHeadCellProps: (props) => {
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            const isAnyColumnResizing = props.table
                .getAllColumns()
                .some((c) => c.getIsResizing());
            const canResize = props.column.getCanResize();

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    justifyContent: 'center',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderLeft: 'none',
                },
                sx: {
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
        mantineTableBodyCellProps: () => {
            return {
                h: 72,
                style: {
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
            >
                <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                    <Tooltip label="Search by item name">
                        <TextInput
                            size="xs"
                            type="search"
                            variant="default"
                            placeholder="Search deleted items..."
                            value={search ?? ''}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="dimmed"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) =>
                                setSearch(e.target.value || undefined)
                            }
                            rightSection={
                                search && (
                                    <ActionIcon
                                        onClick={() => setSearch(undefined)}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                            style={{
                                minWidth: 200,
                                maxWidth: 350,
                                flexShrink: 1,
                            }}
                        />
                    </Tooltip>

                    <ContentTypeFilter
                        selectedContentType={selectedContentType}
                        setSelectedContentType={setSelectedContentType}
                    />

                    {isAdmin && (
                        <DeletedByFilter
                            projectUuid={projectUuid}
                            selectedUserUuids={selectedDeletedByUserUuids}
                            onSelectionChange={setSelectedDeletedByUserUuids}
                        />
                    )}
                </Group>
            </Group>
        ),
        rowVirtualizerInstanceRef,
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 10 },
        state: {
            isLoading,
            showAlertBanner: isError,
            showProgressBars: isFetching,
            density: 'md',
        },
    });

    if (isError) {
        return (
            <Card>
                <Callout variant="danger">
                    Failed to load deleted content. Please try again.
                </Callout>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <Group justify="space-between">
                    <Box>
                        <Title order={5}>Recently Deleted</Title>
                        <Text size="sm" c="dimmed">
                            Items are permanently deleted after {retentionDays}{' '}
                            days
                        </Text>
                    </Box>
                    <Tooltip label="Click to refresh the list">
                        <ActionIcon onClick={() => refetch()} size="xs">
                            <MantineIcon
                                icon={IconRefresh}
                                color="dimmed"
                                stroke={2}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Card>

            <ContentTable table={table} />
        </>
    );
};

export default RecentlyDeletedPage;
