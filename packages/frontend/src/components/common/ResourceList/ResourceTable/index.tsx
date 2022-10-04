import { Colors, Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { AcceptedResources, ResourceListCommonProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import ResourceActionMenu from '../ResourceActionMenu';
import ResourceLastEdited from '../ResourceLastEdited';
import {
    Flex,
    ResourceLink,
    ResourceName,
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

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

type SortingState = null | SortDirection;

type SortingStateMap = Map<string, SortingState>;

type ColumnVisibilityMap = Map<string, boolean>;

export interface ResourceTableCommonProps {
    enableSorting?: boolean;
    enableMultiSort?: boolean;
    defaultSort?: { [key: string]: SortDirection };
    defaultColumnVisibility?: { [key: string]: false };
}

type ResourceTableProps = ResourceTableCommonProps &
    Pick<
        ResourceListCommonProps,
        'resourceList' | 'resourceType' | 'resourceIcon' | 'getURL'
    > & {
        onChangeAction: React.Dispatch<
            React.SetStateAction<{
                actionType: number;
                data?: any;
            }>
        >;
    };

const sortOrder = [SortDirection.DESC, SortDirection.ASC, null];

const getNextSortDirection = (current: SortingState): SortingState => {
    const currentIndex = sortOrder.indexOf(current);
    return sortOrder.concat(sortOrder[0])[currentIndex + 1];
};

const ResourceTable: FC<ResourceTableProps> = ({
    resourceList,
    resourceType,
    resourceIcon,
    enableSorting: enableSortingProp = true,
    enableMultiSort = false,
    defaultColumnVisibility = {},
    defaultSort = {},
    getURL,
    onChangeAction,
}) => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);
    const [columnSorts, setColumnSorts] = useState<SortingStateMap>(new Map());
    const [columnVisibility] = useState<ColumnVisibilityMap>(
        new Map(Object.entries(defaultColumnVisibility)),
    );

    const handleSort = (columnId: string, direction: null | SortDirection) => {
        setColumnSorts(
            enableMultiSort
                ? (prev) => new Map(prev).set(columnId, direction)
                : new Map().set(columnId, direction),
        );
    };

    useMount(() => {
        Object.entries(defaultSort).forEach(([columnId, direction]) => {
            handleSort(columnId, direction);
        });
    });

    const enableSorting = enableSortingProp && resourceList.length > 1;

    const columns = useMemo(() => {
        return [
            {
                id: 'name',
                header: 'Name',
                cell: (row: AcceptedResources) => (
                    <Tooltip2
                        lazy
                        disabled={!row.description}
                        content={row.description}
                        position={Position.TOP}
                    >
                        <ResourceLink
                            to={getURL(row)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon icon={resourceIcon} color={Colors.BLUE5} />
                            <Spacer $width={16} />

                            <ResourceName>{row.name}</ResourceName>
                        </ResourceLink>
                    </Tooltip2>
                ),
                enableSorting,
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    return a.name.localeCompare(b.name);
                },
                meta: {
                    width:
                        columnVisibility.get('space') === false ? '75%' : '50%',
                },
            },
            {
                id: 'space',
                header: 'Space',
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
                    width:
                        columnVisibility.get('space') === false
                            ? undefined
                            : '25%',
                },
            },
            {
                id: 'updatedAt',
                header: 'Last Edited',
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
                    width: '25%',
                },
            },
            {
                id: 'actions',
                cell: (row: AcceptedResources) => (
                    <ResourceActionMenu
                        data={row}
                        spaces={spaces}
                        url={getURL(row)}
                        setActionState={onChangeAction}
                        isChart={resourceType === 'chart'}
                    />
                ),
                enableSorting: false,
                meta: {
                    width: '1px',
                },
            },
        ].filter((c) =>
            columnVisibility.has(c.id) ? columnVisibility.get(c.id) : true,
        );
    }, [
        columnVisibility,
        resourceIcon,
        resourceType,
        enableSorting,
        spaces,
        projectUuid,
        onChangeAction,
        getURL,
    ]);

    const sortedResourceList = useMemo(() => {
        if (columnSorts.size === 0) {
            return resourceList;
        }

        return resourceList.sort((a, b) => {
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
    }, [resourceList, columnSorts, columns]);

    return (
        <StyledTable>
            <StyledTHead>
                <StyledTr>
                    {columns.map((column) => {
                        const columnSort = columnSorts.get(column.id) || null;

                        return (
                            <StyledTh
                                key={column.id}
                                style={{
                                    width: column.meta.width,
                                }}
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
                                        {column?.header}

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
                        onClick={() => history.push(getURL(row))}
                    >
                        {columns.map((column) => (
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
