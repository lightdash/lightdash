import { Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { assertUnreachable } from '@lightdash/common';
import React, { FC, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
    AcceptedResources,
    AcceptedResourceTypes,
    getResourceType,
    ResourceListCommonProps,
} from '.';
import { useSpaces } from '../../../hooks/useSpaces';
import ResourceActionMenu, { ResourceAction } from './ResourceActionMenu';
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
    Pick<ResourceListCommonProps, 'data'> & {
        onAction: (
            action: ResourceAction,
            resource: AcceptedResourceTypes,
            data?: any,
        ) => void;
    };

const sortOrder = [SortDirection.DESC, SortDirection.ASC, null];

interface Column {
    id: ColumnName;
    label?: string;
    cell: (data: AcceptedResources) => React.ReactNode;
    enableSorting: boolean;
    sortingFn?: (a: AcceptedResources, b: AcceptedResources) => number;
    meta?: {
        style: React.CSSProperties;
    };
}

const getNextSortDirection = (current: SortingState): SortingState => {
    const currentIndex = sortOrder.indexOf(current);
    return sortOrder.concat(sortOrder[0])[currentIndex + 1];
};

const getResourceUrl = (projectUuid: string, resource: AcceptedResources) => {
    const resourceType = getResourceType(resource);

    switch (resourceType) {
        case 'dashboard':
            return `/projects/${projectUuid}/dashboards/${resource.uuid}/view`;
        case 'chart':
            return `/projects/${projectUuid}/saved/${resource.uuid}`;
        default:
            return assertUnreachable(
                resourceType,
                `Can't get URL for ${resourceType}`,
            );
    }
};

const ResourceTable: FC<ResourceTableProps> = ({
    data,
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

    const enableSorting = enableSortingProp && data.length > 1;

    const columns = useMemo<Column[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                cell: (row: AcceptedResources) => (
                    <Tooltip2
                        lazy
                        disabled={!row.description}
                        content={row.description}
                        position={Position.TOP_LEFT}
                    >
                        <ResourceLink
                            to={getResourceUrl(projectUuid, row)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ResourceIcon
                                resource={row}
                                resourceType={getResourceType(row)}
                            />

                            <Spacer $width={16} />

                            <ResourceNameBox>
                                <ResourceName>{row.name}</ResourceName>

                                <ResourceMetadata>
                                    <ResourceType
                                        resource={row}
                                        resourceType={getResourceType(row)}
                                    />{' '}
                                    • {row.views} views
                                </ResourceMetadata>
                            </ResourceNameBox>
                        </ResourceLink>
                    </Tooltip2>
                ),
                enableSorting,
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    return a.name.localeCompare(b.name);
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
                cell: (row: AcceptedResources) => {
                    const space = spaces.find((s) => s.uuid === row.spaceUuid);

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
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    const space1 = spaces.find((s) => s.uuid === a.spaceUuid);
                    const space2 = spaces.find((s) => s.uuid === b.spaceUuid);
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
                cell: (row: AcceptedResources) => (
                    <ResourceLastEdited resource={row} />
                ),
                enableSorting,
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    return (
                        new Date(a.updatedAt).getTime() -
                        new Date(b.updatedAt).getTime()
                    );
                },
                meta: {
                    style: { width: '25%' },
                },
            },
            {
                id: 'actions',
                cell: (row: AcceptedResources) => (
                    <ResourceActionMenu
                        data={row}
                        spaces={spaces}
                        url={getResourceUrl(projectUuid, row)}
                        onAction={onAction}
                        isChart={getResourceType(row) === 'chart'}
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

    const sortedResourceList = useMemo(() => {
        if (columnSorts.size === 0) {
            return data;
        }

        return data.sort((a, b) => {
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
    }, [data, columnSorts, visibleColumns]);

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
                {sortedResourceList.map((row) => (
                    <StyledTr
                        key={row.uuid}
                        onClick={() =>
                            history.push(getResourceUrl(projectUuid, row))
                        }
                    >
                        {visibleColumns.map((column) => (
                            <StyledTd key={column.id}>
                                {column.cell(row)}
                            </StyledTd>
                        ))}
                    </StyledTr>
                ))}
            </StyledTBody>
        </StyledTable>
    );
};

export default ResourceTable;
