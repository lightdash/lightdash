import { Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { assertUnreachable } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ResourceListCommonProps } from '.';
import { useSpaces } from '../../../hooks/useSpaces';
import { ResourceListActionState } from './ResourceActionHandlers';
import ResourceActionMenu from './ResourceActionMenu';
import ResourceIcon from './ResourceIcon';
import ResourceLastEdited from './ResourceLastEdited';
import {
    Flex,
    ResourceLink,
    ResourceMetadata,
    ResourceName,
    ResourceNameBox,
    ResourceSpaceLink,
    Spacer,
    StyledTable,
    StyledTBody,
    StyledTd,
    StyledTh,
    StyledTHead,
    StyledTr,
    ThInteractiveWrapper,
} from './ResourceTable.styles';
import ResourceType from './ResourceType';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

type ColumnName = 'name' | 'space' | 'type' | 'updatedAt' | 'actions';

type ColumnVisibilityMap = Map<ColumnName, boolean>;

type SortingState = null | SortDirection;

type SortingStateMap = Map<ColumnName, SortingState>;

export interface ResourceTableCommonProps {
    enableSorting?: boolean;
    enableMultiSort?: boolean;
    defaultSort?: Partial<Record<ColumnName, SortDirection>>;
    defaultColumnVisibility?: Partial<Record<ColumnName, boolean>>;
}

type ResourceTableProps = ResourceTableCommonProps &
    Pick<ResourceListCommonProps, 'items'> & {
        onAction: (newAction: ResourceListActionState) => void;
    };

const sortOrder = [SortDirection.DESC, SortDirection.ASC, null];

interface Column {
    id: ColumnName;
    label?: string;
    cell: (item: ResourceListItem) => React.ReactNode;
    enableSorting: boolean;
    sortingFn?: (a: ResourceListItem, b: ResourceListItem) => number;
    meta?: {
        style: React.CSSProperties;
    };
}

const getNextSortDirection = (current: SortingState): SortingState => {
    const currentIndex = sortOrder.indexOf(current);
    return sortOrder.concat(sortOrder[0])[currentIndex + 1];
};

const getResourceUrl = (projectUuid: string, item: ResourceListItem) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceListType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceListType.CHART:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};

const ResourceTable: FC<ResourceTableProps> = ({
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
                cell: (item: ResourceListItem) => (
                    <Tooltip2
                        lazy
                        disabled={!item.data.description}
                        content={item.data.description}
                        position={Position.TOP_LEFT}
                    >
                        <ResourceLink
                            to={getResourceUrl(projectUuid, item)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ResourceIcon item={item} />

                            <Spacer $width={16} />

                            <ResourceNameBox>
                                <ResourceName>{item.data.name}</ResourceName>

                                <ResourceMetadata>
                                    <ResourceType item={item} /> •{' '}
                                    {item.data.views || '0'} views
                                </ResourceMetadata>
                            </ResourceNameBox>
                        </ResourceLink>
                    </Tooltip2>
                ),
                enableSorting,
                sortingFn: (a: ResourceListItem, b: ResourceListItem) => {
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
                cell: (item: ResourceListItem) => {
                    const space = spaces.find(
                        (s) => s.uuid === item.data.spaceUuid,
                    );

                    return space ? (
                        <ResourceSpaceLink
                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {space.name}
                        </ResourceSpaceLink>
                    ) : null;
                },
                enableSorting,
                sortingFn: (a: ResourceListItem, b: ResourceListItem) => {
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
                cell: (item: ResourceListItem) => (
                    <ResourceLastEdited item={item} />
                ),
                enableSorting,
                sortingFn: (a: ResourceListItem, b: ResourceListItem) => {
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
                id: 'actions',
                cell: (item: ResourceListItem) => (
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
                    const column = visibleColumns.find(
                        (c) => c.id === columnId,
                    );
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
    }, [items, columnSorts, visibleColumns]);

    return (
        <StyledTable>
            <StyledTHead>
                <StyledTr>
                    {visibleColumns.map((column) => {
                        const columnSort = columnSorts.get(column.id) || null;

                        return (
                            <StyledTh
                                key={column.id}
                                style={column?.meta?.style}
                            >
                                <ThInteractiveWrapper
                                    $isInteractive={column.enableSorting}
                                    onClick={() =>
                                        column.enableSorting &&
                                        handleSort(
                                            column.id,
                                            getNextSortDirection(columnSort),
                                        )
                                    }
                                >
                                    <Flex>
                                        {column?.label}

                                        {columnSort ? (
                                            <>
                                                <Spacer $width={5} />

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
                                    </Flex>
                                </ThInteractiveWrapper>
                            </StyledTh>
                        );
                    })}
                </StyledTr>
            </StyledTHead>

            <StyledTBody>
                {sortedResourceItems.map((item) => (
                    <StyledTr
                        key={item.data.uuid}
                        onClick={() =>
                            history.push(getResourceUrl(projectUuid, item))
                        }
                    >
                        {visibleColumns.map((column) => (
                            <StyledTd key={column.id}>
                                {column.cell(item)}
                            </StyledTd>
                        ))}
                    </StyledTr>
                ))}
            </StyledTBody>
        </StyledTable>
    );
};

export default ResourceTable;
