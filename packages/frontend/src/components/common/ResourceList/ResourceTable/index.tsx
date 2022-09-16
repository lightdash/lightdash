import { Colors, Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
    VisibilityState,
} from '@tanstack/react-table';
import React, { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AcceptedResources, ResourceListProps } from '..';
import { useSpaces } from '../../../../hooks/useSpaces';
import ResourceActionMenu from '../ResourceActionMenu';
import ResourceLastEdited from '../ResourceLastEdited';
import { ResourceLink, ResourceSpaceLink } from '../ResourceList.styles';
import {
    Flex,
    Spacer,
    StyledTable,
    StyledTBody,
    StyledTd,
    StyledTh,
    StyledTHead,
    StyledTr,
    ThInteractiveWrapper,
} from './ResourceTable.styles';

const columnHelper = createColumnHelper<AcceptedResources>();

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
    onChangeAction: React.Dispatch<
        React.SetStateAction<{
            actionType: number;
            data?: any;
        }>
    >;
}

const ResourceTable: FC<ResourceTableProps> = ({
    resourceList,
    resourceType,
    resourceIcon,
    showSpaceColumn = false,
    enableSorting = true,
    getURL,
    onChangeAction,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces = [] } = useSpaces(projectUuid);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        space: showSpaceColumn,
    });

    const columns = useMemo(() => {
        return [
            columnHelper.accessor('name', {
                id: 'name',
                header: () => 'Name',
                cell: (info) => (
                    <Flex>
                        <Icon icon={resourceIcon} color={Colors.BLUE5} />
                        <Spacer $width={16} />

                        <Tooltip2
                            lazy
                            disabled={!info.row.original.description}
                            content={info.row.original.description}
                            position={Position.TOP}
                        >
                            <ResourceLink to={getURL(info.row.original)}>
                                {info.getValue()}
                            </ResourceLink>
                        </Tooltip2>
                    </Flex>
                ),
                enableSorting: resourceList.length > 1,
                sortingFn: (a, b) => {
                    return a.original.name.localeCompare(b.original.name);
                },
                meta: {
                    width: showSpaceColumn ? 50 : 75,
                },
            }),
            columnHelper.display({
                id: 'space',
                header: () => 'Space',
                cell: (info) => {
                    const space = spaces.find(
                        (s) => s.uuid === info.row.original.spaceUuid,
                    );

                    return space ? (
                        <ResourceSpaceLink
                            to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                        >
                            {space.name}
                        </ResourceSpaceLink>
                    ) : null;
                },
                enableSorting: resourceList.length > 1,
                sortingFn: (a, b) => {
                    const space1 = spaces.find(
                        (s) => s.uuid === a.original.spaceUuid,
                    );
                    const space2 = spaces.find(
                        (s) => s.uuid === b.original.spaceUuid,
                    );

                    return space1?.name.localeCompare(space2?.name || '') || 0;
                },
                meta: {
                    width: showSpaceColumn ? 25 : undefined,
                },
            }),
            columnHelper.accessor('updatedAt', {
                id: 'updatedAt',
                header: () => 'Last Edited',
                cell: (info) => (
                    <ResourceLastEdited resource={info.row.original} />
                ),
                enableSorting: resourceList.length > 1,
                sortingFn: (a, b) => {
                    return (
                        new Date(a.original.updatedAt).getTime() -
                        new Date(b.original.updatedAt).getTime()
                    );
                },
                meta: {
                    width: 25,
                },
            }),
            columnHelper.display({
                id: 'actions',
                cell: (cell) => (
                    <ResourceActionMenu
                        data={cell.row.original}
                        spaces={spaces}
                        url={getURL(cell.row.original)}
                        setActionState={onChangeAction}
                        isChart={resourceType === 'chart'}
                    />
                ),
                enableSorting: false,
                meta: {
                    width: 1,
                },
            }),
        ];
    }, [
        resourceIcon,
        resourceType,
        resourceList.length,
        showSpaceColumn,
        spaces,
        projectUuid,
        onChangeAction,
        getURL,
    ]);

    const table = useReactTable({
        data: resourceList,
        columns,
        state: {
            sorting,
            columnVisibility,
        },
        enableSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <StyledTable>
            <StyledTHead>
                {table.getHeaderGroups().map((headerGroup) => (
                    <StyledTr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                            const isColumnSorted = header.column.getIsSorted();
                            const canSortColumn = header.column.getCanSort();

                            return (
                                <StyledTh
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        width:
                                            header.column.columnDef.meta
                                                ?.width + '%',
                                    }}
                                >
                                    {header.isPlaceholder ? null : (
                                        <ThInteractiveWrapper
                                            $isInteractive={canSortColumn}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            <Flex>
                                                {flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext(),
                                                )}

                                                {isColumnSorted ? (
                                                    <>
                                                        <Spacer $width={5} />

                                                        {
                                                            {
                                                                asc: (
                                                                    <Icon
                                                                        icon="chevron-up"
                                                                        size={
                                                                            12
                                                                        }
                                                                    />
                                                                ),
                                                                desc: (
                                                                    <Icon
                                                                        icon="chevron-down"
                                                                        size={
                                                                            12
                                                                        }
                                                                    />
                                                                ),
                                                            }[isColumnSorted]
                                                        }
                                                    </>
                                                ) : null}
                                            </Flex>
                                        </ThInteractiveWrapper>
                                    )}
                                </StyledTh>
                            );
                        })}
                    </StyledTr>
                ))}
            </StyledTHead>

            <StyledTBody>
                {table.getRowModel().rows.map((row) => (
                    <StyledTr key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                            <StyledTd key={cell.id}>
                                {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                )}
                            </StyledTd>
                        ))}
                    </StyledTr>
                ))}
            </StyledTBody>
        </StyledTable>
    );
};

export default ResourceTable;
