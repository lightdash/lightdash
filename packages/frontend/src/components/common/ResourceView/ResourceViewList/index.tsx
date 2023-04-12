import {
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    ResourceViewItem,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { createStyles } from '@mantine/styles';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import React, { FC, useMemo, useState } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import { ResourceIcon } from '../ResourceIcon';
import {
    getResourceTypeName,
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
} from '../resourceUtils';
import { ResourceViewItemActionState } from './../ResourceActionHandlers';
import ResourceActionMenu from './../ResourceActionMenu';
import ResourceLastEdited from './../ResourceLastEdited';

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

type ColumnName = 'name' | 'space' | 'updatedAt' | 'actions';

type ColumnVisibilityMap = Map<ColumnName, boolean>;

type SortingState = null | SortDirection;

type SortingStateMap = Map<ColumnName, SortingState>;

export interface ResourceViewListCommonProps {
    enableSorting?: boolean;
    enableMultiSort?: boolean;
    defaultSort?: Partial<Record<ColumnName, SortDirection>>;
    defaultColumnVisibility?: Partial<Record<ColumnName, boolean>>;
}

type ResourceViewListProps = ResourceViewListCommonProps &
    Pick<ResourceViewCommonProps, 'items'> & {
        onAction: (newAction: ResourceViewItemActionState) => void;
    };

const sortOrder = [SortDirection.DESC, SortDirection.ASC, null];

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

const useTableStyles = createStyles((theme) => ({
    root: {
        '& thead tr': {
            backgroundColor: theme.colors.gray[0],
        },

        '& thead tr th': {
            color: theme.colors.gray[6],
            fontWeight: 600,
            fontSize: '12px',
        },

        '& thead tr th, & tbody tr td': {
            padding: '12px 20px',
        },

        '&[data-hover] tbody tr': theme.fn.hover({
            cursor: 'pointer',
            backgroundColor: theme.fn.rgba(theme.colors.gray[0], 0.5),
        }),
    },
}));

const ResourceViewList: FC<ResourceViewListProps> = ({
    items,
    enableSorting: enableSortingProp = true,
    enableMultiSort = false,
    defaultColumnVisibility,
    defaultSort,
    onAction,
}) => {
    const { classes } = useTableStyles();

    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);

    const [columnSorts, setColumnSorts] = useState<SortingStateMap>(
        defaultSort ? new Map(Object.entries(defaultSort)) : new Map(),
    );
    const [columnVisibility] = useState<ColumnVisibilityMap>(
        defaultColumnVisibility
            ? new Map(Object.entries(defaultColumnVisibility))
            : new Map(),
    );

    const handleSort = (
        columnId: ColumnName,
        direction: null | SortDirection,
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
                            to={getResourceUrl(projectUuid, item)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Group noWrap>
                                <ResourceIcon item={item} />

                                <Stack spacing={2}>
                                    <Tooltip
                                        withArrow
                                        disabled={
                                            canBelongToSpace
                                                ? !item.data.description
                                                : true
                                        }
                                        label={
                                            canBelongToSpace
                                                ? item.data.description
                                                : undefined
                                        }
                                        position="top-start"
                                    >
                                        <Text
                                            fw={600}
                                            lineClamp={1}
                                            sx={{ overflowWrap: 'anywhere' }}
                                        >
                                            {item.data.name}
                                        </Text>
                                    </Tooltip>

                                    {canBelongToSpace && (
                                        <Text fz={12} color="gray.6">
                                            {getResourceTypeName(item)} •{' '}
                                            <Tooltip
                                                withArrow
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
                            color="gray.7"
                            component={Link}
                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                            onClick={(e) => e.stopPropagation()}
                            fz={12}
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
                        onClick={(e) => {
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
        [columnVisibility, enableSorting, spaces, projectUuid, onAction],
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
                        case SortDirection.ASC:
                            return acc + sortResult;
                        case SortDirection.DESC:
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
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {visibleColumns.map((column) => {
                        const columnSort = columnSorts.get(column.id) || null;

                        return (
                            <Box
                                component="th"
                                key={column.id}
                                style={column?.meta?.style}
                                sx={
                                    column.enableSorting
                                        ? (theme) => ({
                                              cursor: 'pointer',
                                              userSelect: 'none',
                                              '&:hover': {
                                                  backgroundColor:
                                                      theme.colors.gray[1],
                                              },
                                          })
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
                                <Group spacing={2}>
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
                            </Box>
                        );
                    })}
                </tr>
            </thead>

            <tbody>
                {sortedResourceItems.map((item) => (
                    <tr
                        key={item.data.uuid}
                        onClick={() =>
                            history.push(getResourceUrl(projectUuid, item))
                        }
                    >
                        {visibleColumns.map((column) => (
                            <td key={column.id}>{column.cell(item)}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default ResourceViewList;
