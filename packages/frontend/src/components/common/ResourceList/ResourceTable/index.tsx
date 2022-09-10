import { Button, Colors, Icon, Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    SortingState,
    useReactTable,
} from '@tanstack/react-table';
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DefaultResource, ResourceListProps } from '..';
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
} from './ResourceTable.style';

const columnHelper = createColumnHelper<DefaultResource>();

type ResourceTableProps = Pick<
    ResourceListProps<DefaultResource>,
    'resourceList' | 'resourceType' | 'resourceIcon' | 'getURL'
>;

const ResourceTable: React.FC<ResourceTableProps> = ({
    resourceList,
    resourceType,
    resourceIcon,
    getURL,
}) => {
    const [sorting, setSorting] = React.useState<SortingState>([]);

    const columns = useMemo(() => {
        return [
            columnHelper.accessor('name', {
                header: () => 'Name',
                cell: (info) => (
                    <Flex>
                        <Icon icon={resourceIcon} color={Colors.BLUE5} />
                        <Spacer $width={16} />

                        <Tooltip2
                            lazy
                            content={info.row.original.description}
                            position={Position.TOP}
                        >
                            <Link to={getURL(info.row.original)}>
                                {info.getValue()}
                            </Link>
                        </Tooltip2>
                    </Flex>
                ),
                enableSorting: true,
                sortingFn: (a, b) => {
                    return a.original.name.localeCompare(b.original.name);
                },
            }),
            columnHelper.accessor('updatedAt', {
                header: () => 'Last Edited',
                cell: (info) => (
                    <>{new Date(info.getValue()).toLocaleDateString()}</>
                ),
                enableSorting: true,
                sortingFn: (a, b) => {
                    return (
                        new Date(a.original.updatedAt).getTime() -
                        new Date(b.original.updatedAt).getTime()
                    );
                },
            }),
            columnHelper.display({
                id: 'actions',
                cell: () => (
                    <>
                        <Button minimal icon="more" />
                    </>
                ),
                enableSorting: false,
            }),
        ];
    }, [resourceIcon, getURL]);

    const table = useReactTable({
        data: resourceList,
        columns,
        state: {
            sorting,
        },
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

                            return (
                                <StyledTh
                                    key={header.id}
                                    colSpan={header.colSpan}
                                >
                                    {header.isPlaceholder ? null : (
                                        <ThInteractiveWrapper
                                            $isInteractive={header.column.getCanSort()}
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
