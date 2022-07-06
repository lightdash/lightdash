import { Button, ButtonGroup } from '@blueprintjs/core';
import {
    ColumnDef,
    ColumnOrderState,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import React, { FC } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import {
    PageCount,
    PaginationWrapper,
} from '../../ResultsTable/ResultsTable.styles';
import { Table, TableContainer, TableFooter } from './Table.styles';

export type TableRow = { [col: string]: any };

type Props = {
    data: TableRow[];
    columns: ColumnDef<TableRow>[];
};

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 5000;

const ResultsTable: FC<Props> = ({ data, columns }) => {
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>([]);
    const currentColOrder = React.useRef<Array<string>>([]);

    const table = useReactTable({
        data,
        columns,
        state: {
            columnVisibility,
            columnOrder,
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
    return (
        <TableContainer className="cohere-block">
            <Table bordered condensed>
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <DragDropContext
                            onDragStart={() => {
                                currentColOrder.current = columnOrder;
                            }}
                            onDragUpdate={(dragUpdateObj, b) => {
                                const colOrder = [...currentColOrder.current];
                                const sIndex = dragUpdateObj.source.index;
                                const dIndex =
                                    dragUpdateObj.destination &&
                                    dragUpdateObj.destination.index;

                                if (typeof dIndex === 'number') {
                                    colOrder.splice(sIndex, 1);
                                    colOrder.splice(
                                        dIndex,
                                        0,
                                        dragUpdateObj.draggableId,
                                    );
                                    setColumnOrder(colOrder);
                                }
                            }}
                            onDragEnd={() => undefined}
                        >
                            <Droppable
                                droppableId="droppable"
                                direction="horizontal"
                                renderClone={(provided, snapshot, rubric) => {
                                    const header = headerGroup.headers.find(
                                        ({ id }) => id === rubric.draggableId,
                                    );
                                    return (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            style={{
                                                ...provided.draggableProps
                                                    .style,
                                                ...(!snapshot.isDragging && {
                                                    transform: 'translate(0,0)',
                                                }),
                                                ...(snapshot.isDropAnimating && {
                                                    transitionDuration:
                                                        '0.001s',
                                                }),
                                            }}
                                        >
                                            {!header || header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </div>
                                    );
                                }}
                            >
                                {(droppableProvided) => (
                                    <tr
                                        ref={droppableProvided.innerRef}
                                        {...droppableProvided.droppableProps}
                                    >
                                        {headerGroup.headers.map((header) => (
                                            <th colSpan={header.colSpan}>
                                                <Draggable
                                                    key={header.id}
                                                    draggableId={header.id}
                                                    index={header.index}
                                                    isDragDisabled={false}
                                                >
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={
                                                                provided.innerRef
                                                            }
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            style={{
                                                                ...provided
                                                                    .draggableProps
                                                                    .style,
                                                                ...(!snapshot.isDragging && {
                                                                    transform:
                                                                        'translate(0,0)',
                                                                }),
                                                                ...(snapshot.isDropAnimating && {
                                                                    transitionDuration:
                                                                        '0.001s',
                                                                }),
                                                            }}
                                                        >
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(
                                                                      header
                                                                          .column
                                                                          .columnDef
                                                                          .header,
                                                                      header.getContext(),
                                                                  )}
                                                        </div>
                                                    )}
                                                </Draggable>
                                            </th>
                                        ))}
                                    </tr>
                                )}
                            </Droppable>
                        </DragDropContext>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    {table.getFooterGroups().map((footerGroup) => (
                        <tr key={footerGroup.id}>
                            {footerGroup.headers.map((header) => (
                                <th key={header.id} colSpan={header.colSpan}>
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                              header.column.columnDef.footer,
                                              header.getContext(),
                                          )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </tfoot>
            </Table>
            <TableFooter>
                <ButtonGroup>
                    {table.getState().pagination.pageSize > 1 && (
                        <>
                            <Button
                                active={
                                    table.getState().pagination.pageSize !==
                                    DEFAULT_PAGE_SIZE
                                }
                                text="Scroll"
                                onClick={() => table.setPageSize(MAX_PAGE_SIZE)}
                            />
                            <Button
                                active={
                                    table.getState().pagination.pageSize ===
                                    DEFAULT_PAGE_SIZE
                                }
                                text="Pages"
                                onClick={() =>
                                    table.setPageSize(DEFAULT_PAGE_SIZE)
                                }
                            />
                        </>
                    )}
                </ButtonGroup>
                {table.getPageCount() > 1 ? (
                    <PaginationWrapper>
                        <PageCount>
                            Page{' '}
                            <b>{table.getState().pagination.pageIndex + 1}</b>{' '}
                            of <b>{table.getPageCount()}</b>
                        </PageCount>
                        <Button
                            style={{ marginLeft: 20 }}
                            icon="arrow-left"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        />
                        <Button
                            style={{ marginLeft: 10 }}
                            icon="arrow-right"
                            onClick={() => {
                                console.log('asd');
                                table.nextPage();
                            }}
                            disabled={!table.getCanNextPage()}
                        />
                    </PaginationWrapper>
                ) : (
                    <PageCount>
                        <b>{table.getRowModel().rows.length} results</b>
                    </PageCount>
                )}
            </TableFooter>
        </TableContainer>
    );
};

export default ResultsTable;
