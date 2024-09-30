import {
    isResourceViewItemChart,
    isResourceViewItemDashboard,
    isResourceViewSpaceItem,
    type ResourceViewItem,
} from '@lightdash/common';
import { Anchor, Box, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import { type ResourceViewCommonProps } from '..';
import { useTableStyles } from '../../../../hooks/styles/useTableStyles';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../../hooks/validation/useValidation';
import { ResourceIcon, ResourceIndicator } from '../../ResourceIcon';
import { ResourceInfoPopup } from '../../ResourceInfoPopup/ResourceInfoPopup';
import {
    getResourceTypeName,
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
} from '../resourceUtils';
import { type ResourceViewItemActionState } from './../ResourceActionHandlers';
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
                                                        color="blue.4"
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
                                                isResourceViewItemChart(
                                                    item,
                                                )) &&
                                            canBelongToSpace &&
                                            hoveredItem === item.data.uuid && (
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
                        onMouseEnter={() => setHoveredItem(item.data.uuid)}
                        onMouseLeave={() => setHoveredItem(undefined)}
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
