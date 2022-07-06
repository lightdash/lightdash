import { Button, ButtonGroup, Colors } from '@blueprintjs/core';
import { Field, TableCalculation } from '@lightdash/common';
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
import {
    Table,
    TableContainer,
    TableFooter,
    TableScrollableWrapper,
} from './Table.styles';

type TableRow = { [col: string]: any };

export type TableColumn = ColumnDef<TableRow> & {
    meta?: {
        width?: number;
        draggable?: boolean;
        item?: Field | TableCalculation;
        bgColor?: string;
    };
};

type Props = {
    data: TableRow[];
    columns: TableColumn[];
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 5000;

const ROW_NUMBER_COLUMN_ID = 'row_number_column';

const rowColumn: TableColumn = {
    id: ROW_NUMBER_COLUMN_ID,
    header: '#',
    cell: (props) => props.row.index + 1,
    footer: 'Total',
    meta: {
        width: 30,
    },
};

const ResultsTable: FC<Props> = ({ data, columns }) => {
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>([]);
    const currentColOrder = React.useRef<Array<string>>([]);

    const table = useReactTable({
        data,
        columns: [rowColumn, ...columns],
        state: {
            columnVisibility,
            columnOrder: [ROW_NUMBER_COLUMN_ID, ...columnOrder],
        },
        onColumnVisibilityChange: setColumnVisibility,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
    return (
        <TableContainer className="cohere-block">
            <TableScrollableWrapper>
                <Table bordered condensed>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <colgroup key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                const meta = header.column.columnDef
                                    .meta as TableColumn['meta'];
                                return (
                                    <col
                                        style={{
                                            backgroundColor:
                                                meta?.bgColor ?? Colors.WHITE,
                                        }}
                                    />
                                );
                            })}
                        </colgroup>
                    ))}
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <DragDropContext
                                onDragStart={() => {
                                    currentColOrder.current = columnOrder;
                                }}
                                onDragUpdate={(dragUpdateObj) => {
                                    const colOrder = [
                                        ...currentColOrder.current,
                                    ];
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
                                        setColumnOrder(
                                            colOrder.filter(
                                                (col) =>
                                                    col !==
                                                    ROW_NUMBER_COLUMN_ID,
                                            ),
                                        );
                                    }
                                }}
                                onDragEnd={() => undefined}
                            >
                                <Droppable
                                    droppableId="droppable"
                                    direction="horizontal"
                                    renderClone={(
                                        provided,
                                        snapshot,
                                        rubric,
                                    ) => {
                                        const header = headerGroup.headers.find(
                                            ({ id }) =>
                                                id === rubric.draggableId,
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
                                                        transform:
                                                            'translate(0,0)',
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
                                                          header.column
                                                              .columnDef.header,
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
                                            {headerGroup.headers.map(
                                                (header) => {
                                                    const meta = header.column
                                                        .columnDef
                                                        .meta as TableColumn['meta'];
                                                    return (
                                                        <th
                                                            colSpan={
                                                                header.colSpan
                                                            }
                                                            style={{
                                                                width: meta?.width,
                                                                backgroundColor:
                                                                    meta?.bgColor ??
                                                                    Colors.WHITE,
                                                            }}
                                                        >
                                                            <Draggable
                                                                key={header.id}
                                                                draggableId={
                                                                    header.id
                                                                }
                                                                index={
                                                                    header.index
                                                                }
                                                                isDragDisabled={
                                                                    !meta?.draggable
                                                                }
                                                            >
                                                                {(
                                                                    provided,
                                                                    snapshot,
                                                                ) => (
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
                                                    );
                                                },
                                            )}
                                        </tr>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, rowIndex) => (
                            <tr key={row.id}>
                                {row
                                    .getVisibleCells()
                                    .map((cell, cellIndex) => (
                                        <td
                                            key={cell.id}
                                            style={{
                                                backgroundColor:
                                                    cellIndex === 0 ||
                                                    rowIndex % 2
                                                        ? undefined
                                                        : Colors.LIGHT_GRAY4,
                                            }}
                                        >
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
                                {footerGroup.headers.map((header) => {
                                    const meta = header.column.columnDef
                                        .meta as TableColumn['meta'];
                                    return (
                                        <th
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            style={{
                                                backgroundColor: Colors.WHITE,
                                            }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .footer,
                                                      header.getContext(),
                                                  )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </tfoot>
                </Table>
            </TableScrollableWrapper>
            <TableFooter>
                <ButtonGroup>
                    {data.length > DEFAULT_PAGE_SIZE && (
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
                            onClick={() => table.nextPage()}
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
