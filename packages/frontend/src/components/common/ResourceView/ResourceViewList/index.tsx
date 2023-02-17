import { Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ResourceViewCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import {
    isResourceViewItemCanBelongToSpace,
    ResourceViewItem,
    ResourceViewItemType,
} from '../resourceTypeUtils';
import { getResourceTypeName, getResourceUrl } from '../resourceUtils';
import { ResourceViewItemActionState } from './../ResourceActionHandlers';
import ResourceActionMenu from './../ResourceActionMenu';
import ResourceIcon from './../ResourceIcon';
import ResourceLastEdited from './../ResourceLastEdited';
import {
    ResourceViewListFlex,
    ResourceViewListLink,
    ResourceViewListMetadata,
    ResourceViewListName,
    ResourceViewListNameBox,
    ResourceViewListSpaceLink,
    ResourceViewListSpacer,
    ResourceViewListTable,
    ResourceViewListTBody,
    ResourceViewListTd,
    ResourceViewListTh,
    ResourceViewListTHead,
    ResourceViewListThInteractiveWrapper,
    ResourceViewListTr,
} from './ResourceViewList.styles';

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

type ColumnName = 'name' | 'space' | 'type' | 'updatedAt' | 'actions';

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
                        isResourceViewItemCanBelongToSpace(item);

                    return (
                        <Tooltip2
                            lazy
                            disabled={
                                canBelongToSpace ? !item.data.description : true
                            }
                            content={
                                canBelongToSpace
                                    ? item.data.description
                                    : undefined
                            }
                            position={Position.TOP_LEFT}
                        >
                            <ResourceViewListLink
                                to={getResourceUrl(projectUuid, item)}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ResourceIcon item={item} />

                                <ResourceViewListSpacer $width={16} />

                                <ResourceViewListNameBox>
                                    <ResourceViewListName>
                                        {item.data.name}
                                    </ResourceViewListName>

                                    {canBelongToSpace && (
                                        <ResourceViewListMetadata>
                                            {getResourceTypeName(item)} •{' '}
                                            {item.data.views || '0'} views
                                        </ResourceViewListMetadata>
                                    )}
                                </ResourceViewListNameBox>
                            </ResourceViewListLink>
                        </Tooltip2>
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
                                ? '75%'
                                : '50%',
                    },
                },
            },
            {
                id: 'space',
                label: 'Space',
                cell: (item: ResourceViewItem) => {
                    if (!isResourceViewItemCanBelongToSpace(item)) {
                        return null;
                    }

                    const space = spaces.find(
                        (s) => s.uuid === item.data.spaceUuid,
                    );

                    return space ? (
                        <ResourceViewListSpaceLink
                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {space.name}
                        </ResourceViewListSpaceLink>
                    ) : null;
                },
                enableSorting,
                sortingFn: (a: ResourceViewItem, b: ResourceViewItem) => {
                    if (
                        !isResourceViewItemCanBelongToSpace(a) ||
                        !isResourceViewItemCanBelongToSpace(b)
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
                                : '25%',
                    },
                },
            },
            {
                id: 'updatedAt',
                label: 'Last Edited',
                cell: (item: ResourceViewItem) => {
                    if (!isResourceViewItemCanBelongToSpace(item)) return null;
                    return <ResourceLastEdited item={item} />;
                },
                enableSorting,
                sortingFn: (a: ResourceViewItem, b: ResourceViewItem) => {
                    if (
                        !isResourceViewItemCanBelongToSpace(a) ||
                        !isResourceViewItemCanBelongToSpace(b)
                    ) {
                        return 0;
                    }

                    return (
                        new Date(a.data.updatedAt).getTime() -
                        new Date(b.data.updatedAt).getTime()
                    );
                },
                meta: {
                    style: { width: '25%' },
                },
            },
            {
                id: 'type',
                label: 'Type',
                cell: (item: ResourceViewItem) => (
                    <ResourceViewListNameBox>
                        <ResourceViewListMetadata>
                            {getResourceTypeName(item)}
                        </ResourceViewListMetadata>
                    </ResourceViewListNameBox>
                ),
                enableSorting,
                sortingFn: (a: ResourceViewItem) => {
                    return a.type === ResourceViewItemType.DASHBOARD ? 1 : -1;
                },
                meta: {
                    style: {
                        width:
                            columnVisibility.get('type') === false
                                ? undefined
                                : '25%',
                    },
                },
            },
            {
                id: 'actions',
                cell: (item: ResourceViewItem) => (
                    <ResourceActionMenu
                        item={item}
                        spaces={spaces}
                        url={getResourceUrl(projectUuid, item)}
                        onAction={onAction}
                    />
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
        <ResourceViewListTable>
            <ResourceViewListTHead>
                <ResourceViewListTr>
                    {visibleColumns.map((column) => {
                        const columnSort = columnSorts.get(column.id) || null;

                        return (
                            <ResourceViewListTh
                                key={column.id}
                                style={column?.meta?.style}
                            >
                                <ResourceViewListThInteractiveWrapper
                                    $isInteractive={column.enableSorting}
                                    onClick={() =>
                                        column.enableSorting &&
                                        handleSort(
                                            column.id,
                                            getNextSortDirection(columnSort),
                                        )
                                    }
                                >
                                    <ResourceViewListFlex>
                                        {column?.label}

                                        {columnSort ? (
                                            <>
                                                <ResourceViewListSpacer
                                                    $width={5}
                                                />

                                                {enableSorting &&
                                                    {
                                                        asc: (
                                                            <Icon
                                                                icon="chevron-up"
                                                                size={12}
                                                            />
                                                        ),
                                                        desc: (
                                                            <Icon
                                                                icon="chevron-down"
                                                                size={12}
                                                            />
                                                        ),
                                                    }[columnSort]}
                                            </>
                                        ) : null}
                                    </ResourceViewListFlex>
                                </ResourceViewListThInteractiveWrapper>
                            </ResourceViewListTh>
                        );
                    })}
                </ResourceViewListTr>
            </ResourceViewListTHead>

            <ResourceViewListTBody>
                {sortedResourceItems.map((item) => (
                    <ResourceViewListTr
                        key={item.data.uuid}
                        onClick={() =>
                            history.push(getResourceUrl(projectUuid, item))
                        }
                    >
                        {visibleColumns.map((column) => (
                            <ResourceViewListTd key={column.id}>
                                {column.cell(item)}
                            </ResourceViewListTd>
                        ))}
                    </ResourceViewListTr>
                ))}
            </ResourceViewListTBody>
        </ResourceViewListTable>
    );
};

export default ResourceViewList;
