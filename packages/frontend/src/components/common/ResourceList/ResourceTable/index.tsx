import { Colors, Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AcceptedResources, ResourceListProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import ResourceActionMenu from '../ResourceActionMenu';
import ResourceLastEdited from '../ResourceLastEdited';
import {
    Flex,
    NoLinkContainer,
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

enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

type SortingState = null | SortDirection;

type SortingStateMap = Map<string, SortingState>;

type ColumnVisibilityMap = Map<string, boolean>;

interface ResourceTableProps
    extends Pick<
        ResourceListProps,
        | 'resourceList'
        | 'resourceType'
        | 'resourceIcon'
        | 'getURL'
        | 'showSpaceColumn'
        | 'enableSorting'
    > {
    enableMultiSort?: boolean;
    onChangeAction: React.Dispatch<
        React.SetStateAction<{
            actionType: number;
            data?: any;
        }>
    >;
}

const sortOrder = [SortDirection.ASC, SortDirection.DESC, null];

const getNextSortDirection = (current: SortingState): SortingState => {
    const currentIndex = sortOrder.indexOf(current);
    return sortOrder.concat(sortOrder[0])[currentIndex + 1];
};

const ResourceTable: FC<ResourceTableProps> = ({
    resourceList,
    resourceType,
    resourceIcon,
    showSpaceColumn = false,
    enableSorting = true,
    enableMultiSort = true,
    getURL,
    onChangeAction,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);
    const [columnSorts, setColumnSorts] = useState<SortingStateMap>(new Map());
    const [columnVisibility] = useState<ColumnVisibilityMap>(
        new Map([['space', showSpaceColumn]]),
    );

    const handleSort = (columnId: string, direction: null | SortDirection) => {
        setColumnSorts(
            enableMultiSort
                ? (prev) => new Map(prev).set(columnId, direction)
                : new Map().set(columnId, direction),
        );
    };

    const columns = useMemo(() => {
        return [
            {
                id: 'name',
                header: 'Name',
                cell: (row: AcceptedResources) => (
                    <>
                        <ResourceLink
                            className="full-row-link"
                            to={getURL(row)}
                        />

                        <NoLinkContainer>
                            <Flex>
                                <Icon
                                    icon={resourceIcon}
                                    color={Colors.BLUE5}
                                />
                                <Spacer $width={16} />

                                <Tooltip2
                                    lazy
                                    disabled={!row.description}
                                    content={row.description}
                                    position={Position.TOP}
                                >
                                    <ResourceName>{row.name}</ResourceName>
                                </Tooltip2>
                            </Flex>
                        </NoLinkContainer>
                    </>
                ),
                enableSorting: enableSorting && resourceList.length > 1,
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    return a.name.localeCompare(b.name);
                },
                meta: {
                    width: showSpaceColumn ? '50%' : '75%',
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
                        >
                            {space.name}
                        </ResourceSpaceLink>
                    ) : null;
                },
                enableSorting: enableSorting && resourceList.length > 1,
                sortingFn: (a: AcceptedResources, b: AcceptedResources) => {
                    const space1 = spaces.find((s) => s.uuid === a.spaceUuid);
                    const space2 = spaces.find((s) => s.uuid === b.spaceUuid);
                    return space1?.name.localeCompare(space2?.name || '') || 0;
                },
                meta: {
                    width: showSpaceColumn ? '25%' : undefined,
                },
            },
            {
                id: 'updatedAt',
                header: 'Last Edited',
                cell: (row: AcceptedResources) => (
                    <NoLinkContainer>
                        <ResourceLastEdited resource={row} />
                    </NoLinkContainer>
                ),
                enableSorting: enableSorting && resourceList.length > 1,
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
        resourceList.length,
        showSpaceColumn,
        enableSorting,
        spaces,
        projectUuid,
        onChangeAction,
        getURL,
    ]);

    const sortedResourceList = useMemo(() => {
        if (columnSorts.size === 0) {
            return resourceList;
        } else {
            return resourceList.sort((a, b) => {
                return [...columnSorts.entries()].reduce(
                    (acc, [columnId, sortDirection]) => {
                        const column = columns.find((c) => c.id === columnId);

                        const sortResult = column?.sortingFn?.(a, b) ?? 0;

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
        }
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

                                                {
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
                                                    }[columnSort]
                                                }
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
                    <StyledTr key={row.uuid}>
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
