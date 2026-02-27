import {
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../../hooks/validation/useValidation';
import { ResourceIcon, ResourceIndicator } from '../../ResourceIcon';
import { ResourceInfoPopup } from '../../ResourceInfoPopup/ResourceInfoPopup';
import {
    getResourceTypeName,
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
} from '../resourceUtils';
import {
    ResourceSortDirection,
    type ResourceViewCommonProps,
    type ResourceViewItemActionState,
} from '../types';
import ResourceActionMenu from './../ResourceActionMenu';
import ResourceLastEdited from './../ResourceLastEdited';
import classes from './ResourceViewList.module.css';

type ColumnName = 'name' | 'space' | 'updatedAt' | 'actions';

type ColumnVisibilityMap = Map<ColumnName, boolean>;

type SortingState = null | ResourceSortDirection;

type SortingStateMap = Map<ColumnName, SortingState>;

export interface ResourceViewListCommonProps {
    enableSorting?: boolean;
    enableMultiSort?: boolean;
    defaultSort?: Partial<Record<ColumnName, ResourceSortDirection>>;
    defaultColumnVisibility?: Partial<Record<ColumnName, boolean>>;
}

type ResourceViewListProps = ResourceViewListCommonProps &
    Pick<ResourceViewCommonProps, 'items'> & {
        onAction: (newAction: ResourceViewItemActionState) => void;
    };

const sortOrder = [ResourceSortDirection.DESC, ResourceSortDirection.ASC, null];

interface Column {
    id: ColumnName;
    label?: string;
    cell: (item: ResourceViewItem) => React.ReactNode;
    enableSorting: boolean;
    sortingFn?: (a: ResourceViewItem, b: ResourceViewItem) => number;
    meta?: {
        style: React.CSSProperties;
    };
}

const getNextSortDirection = (current: SortingState): SortingState => {
    const currentIndex = sortOrder.indexOf(current);
    return sortOrder.concat(sortOrder[0])[currentIndex + 1];
};

const ResourceViewList: FC<ResourceViewListProps> = ({
    items,
    enableSorting: enableSortingProp = true,
    enableMultiSort = false,
    defaultColumnVisibility,
    defaultSort,
    onAction,
}) => {
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaceSummaries(projectUuid);
    const canUserManageValidation = useValidationUserAbility(projectUuid);

    const [columnSorts, setColumnSorts] = useState<SortingStateMap>(
        defaultSort ? new Map(Object.entries(defaultSort)) : new Map(),
    );
    const [columnVisibility] = useState<ColumnVisibilityMap>(
        defaultColumnVisibility
            ? new Map(Object.entries(defaultColumnVisibility))
            : new Map(),
    );

    const [hoveredItem, setHoveredItem] = useState<string>();

    const handleSort = (
        columnId: ColumnName,
        direction: null | ResourceSortDirection,
    ) => {
        setColumnSorts(
            enableMultiSort
                ? (prev) => new Map(prev).set(columnId, direction)
                : new Map().set(columnId, direction),
        );
    };

    const enableSorting = enableSortingProp && items.length > 1;

    const columns = useMemo<Column[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                cell: (item: ResourceViewItem) => {
                    if (!projectUuid) {
                        return null;
                    }

                    const canBelongToSpace =
                        isResourceViewItemChart(item) ||
                        isResourceViewItemDashboard(item);

                    return (
                        <Anchor
                            component={Link}
                            className={classes.anchor}
                            to={getResourceUrl(projectUuid, item)}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                                e.stopPropagation()
                            }
                        >
                            <Group wrap="nowrap">
                                {canBelongToSpace &&
                                item.data.validationErrors?.length ? (
                                    <ResourceIndicator
                                        iconProps={{
                                            icon: IconAlertTriangle,
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
                                                    This content is broken.
                                                    Learn more about the
                                                    validation error(s){' '}
                                                    <Anchor
                                                        component={Link}
                                                        fw={600}
                                                        to={{
                                                            pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                                            search: `?validationId=${item.data.validationErrors[0].validationId}`,
                                                        }}
                                                        c="blue.4"
                                                        fz="xs"
                                                    >
                                                        here
                                                    </Anchor>
                                                    .
                                                </>
                                            ) : (
                                                <>
                                                    There's an error with this{' '}
                                                    {isResourceViewItemChart(
                                                        item,
                                                    )
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

                                <Stack gap={2}>
                                    <Group gap="xs" wrap="nowrap">
                                        <Text
                                            fw={600}
                                            fz="sm"
                                            lineClamp={1}
                                            className={classes.itemName}
                                        >
                                            {item.data.name}
                                        </Text>
                                        {!isResourceViewSpaceItem(item) &&
                                            // If there is no description, don't show the info icon on dashboards.
                                            // For charts we still show it for the dashboard list
                                            (item.data.description ||
                                                isResourceViewItemChart(
                                                    item,
                                                )) &&
                                            canBelongToSpace &&
                                            hoveredItem === item.data.uuid &&
                                            projectUuid && (
                                                <Box>
                                                    <ResourceInfoPopup
                                                        resourceUuid={
                                                            item.data.uuid
                                                        }
                                                        projectUuid={
                                                            projectUuid
                                                        }
                                                        description={
                                                            item.data
                                                                .description
                                                        }
                                                        withChartData={isResourceViewItemChart(
                                                            item,
                                                        )}
                                                    />
                                                </Box>
                                            )}
                                    </Group>
                                    {canBelongToSpace && (
                                        <Text fz="xs" c="ldGray.6">
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
                                                    {item.data.views || '0'}{' '}
                                                    views
                                                </span>
                                            </Tooltip>
                                        </Text>
                                    )}
                                </Stack>
                            </Group>
                        </Anchor>
                    );
                },
                enableSorting,
                sortingFn: (a: ResourceViewItem, b: ResourceViewItem) => {
                    return a.data.name.localeCompare(b.data.name);
                },
                meta: {
                    style: {
                        width:
                            columnVisibility.get('space') === false
                                ? '80%'
                                : '65%',
                    },
                },
            },
            {
                id: 'space',
                label: 'Space',
                cell: (item: ResourceViewItem) => {
                    if (isResourceViewSpaceItem(item)) {
                        return null;
                    }

                    const space = spaces.find(
                        (s) => s.uuid === item.data.spaceUuid,
                    );

                    return space ? (
                        <Anchor
                            c="ldGray.7"
                            component={Link}
                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                                e.stopPropagation()
                            }
                            fz="xs"
                            fw={500}
                        >
                            {space.name}
                        </Anchor>
                    ) : null;
                },
                enableSorting,
                sortingFn: (a: ResourceViewItem, b: ResourceViewItem) => {
                    if (
                        isResourceViewSpaceItem(a) ||
                        isResourceViewSpaceItem(b)
                    ) {
                        return 0;
                    }

                    const space1 = spaces.find(
                        (s) => s.uuid === a.data.spaceUuid,
                    );
                    const space2 = spaces.find(
                        (s) => s.uuid === b.data.spaceUuid,
                    );
                    return space1?.name.localeCompare(space2?.name || '') || 0;
                },
                meta: {
                    style: {
                        width:
                            columnVisibility.get('space') === false
                                ? undefined
                                : '15%',
                    },
                },
            },
            {
                id: 'updatedAt',
                label: 'Last Edited',
                cell: (item: ResourceViewItem) => {
                    if (isResourceViewSpaceItem(item)) return null;
                    return <ResourceLastEdited item={item} />;
                },
                enableSorting,
                sortingFn: (a: ResourceViewItem, b: ResourceViewItem) => {
                    if (
                        isResourceViewSpaceItem(a) ||
                        isResourceViewSpaceItem(b)
                    ) {
                        return 0;
                    }

                    return (
                        new Date(a.data.updatedAt).getTime() -
                        new Date(b.data.updatedAt).getTime()
                    );
                },
                meta: {
                    style: { width: '20%' },
                },
            },
            {
                id: 'actions',
                cell: (item: ResourceViewItem) => (
                    <Box
                        component="div"
                        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        <ResourceActionMenu item={item} onAction={onAction} />
                    </Box>
                ),
                enableSorting: false,
                meta: {
                    style: { width: '1px' },
                },
            },
        ],
        [
            enableSorting,
            columnVisibility,
            projectUuid,
            canUserManageValidation,
            spaces,
            onAction,
            hoveredItem,
        ],
    );

    const visibleColumns = useMemo(() => {
        return columns.filter((c) =>
            columnVisibility.has(c.id) ? columnVisibility.get(c.id) : true,
        );
    }, [columnVisibility, columns]);

    const sortedResourceItems = useMemo(() => {
        if (columnSorts.size === 0) {
            return items;
        }

        return items.sort((a, b) => {
            return [...columnSorts.entries()].reduce(
                (acc, [columnId, sortDirection]) => {
                    const column = columns.find((c) => c.id === columnId);
                    if (!column) {
                        throw new Error('Column with id does not exist!');
                    }

                    if (!column.sortingFn) {
                        throw new Error(
                            'Column does not have sorting function!',
                        );
                    }

                    const sortResult = column.sortingFn(a, b) ?? 0;

                    switch (sortDirection) {
                        case ResourceSortDirection.ASC:
                            return acc + sortResult;
                        case ResourceSortDirection.DESC:
                            return acc - sortResult;
                        default:
                            return acc;
                    }
                },
                0,
            );
        });
    }, [items, columnSorts, columns]);

    return (
        <Table className={classes.table} highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                    {visibleColumns.map((column) => {
                        const columnSort = columnSorts.get(column.id) || null;

                        return (
                            <Table.Th
                                key={column.id}
                                w={column?.meta?.style?.width}
                                className={
                                    column.enableSorting
                                        ? classes.sortableHeader
                                        : undefined
                                }
                                onClick={() =>
                                    column.enableSorting
                                        ? handleSort(
                                              column.id,
                                              getNextSortDirection(columnSort),
                                          )
                                        : undefined
                                }
                            >
                                <Group gap={2}>
                                    {column?.label}

                                    {enableSorting && columnSort
                                        ? {
                                              asc: <IconChevronUp size={12} />,
                                              desc: (
                                                  <IconChevronDown size={12} />
                                              ),
                                          }[columnSort]
                                        : null}
                                </Group>
                            </Table.Th>
                        );
                    })}
                </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
                {sortedResourceItems.map((item) => (
                    <Table.Tr
                        key={item.data.uuid}
                        onClick={() =>
                            projectUuid &&
                            navigate(getResourceUrl(projectUuid, item))
                        }
                        onMouseEnter={() => setHoveredItem(item.data.uuid)}
                        onMouseLeave={() => setHoveredItem(undefined)}
                    >
                        {visibleColumns.map((column) => (
                            <Table.Td key={column.id}>
                                {column.cell(item)}
                            </Table.Td>
                        ))}
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
};

export default ResourceViewList;
