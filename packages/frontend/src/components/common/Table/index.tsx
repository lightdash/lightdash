import { Button, ButtonGroup, Colors, Icon, Tag } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    Field,
    isField,
    isNumericItem,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import {
    Cell,
    ColumnDef,
    ColumnOrderState,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    Header,
    useReactTable,
} from '@tanstack/react-table';
import React, { FC, MouseEventHandler } from 'react';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import {
    PageCount,
    PaginationWrapper,
} from '../../ResultsTable/ResultsTable.styles';
import {
    BodyCell,
    HeaderCell,
    Table,
    TableContainer,
    TableFooter,
    TableScrollableWrapper,
} from './Table.styles';

type TableRow = { [col: string]: any };

export type HeaderProps = { header: Header<TableRow> };
export type CellContextMenuProps = { cell: Cell<TableRow> };

export type TableColumn = ColumnDef<TableRow> & {
    meta?: {
        width?: number;
        draggable?: boolean;
        item?: Field | TableCalculation;
        bgColor?: string;
        sort?: SortIndicatorProps;
        onHeaderClick?: MouseEventHandler<HTMLTableHeaderCellElement>;
    };
};

type Props = {
    data: TableRow[];
    columns: TableColumn[];
    headerContextMenu?: FC<HeaderProps>;
    headerButton?: FC<HeaderProps>;
    cellContextMenu?: FC<CellContextMenuProps>;
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

type SortIndicatorProps = {
    sortIndex: number;
    sort: SortField;
    isNumeric: boolean;
    isMultiSort: boolean;
};

const SortIndicator: FC<SortIndicatorProps> = ({
    sortIndex,
    isMultiSort,
    isNumeric,
    sort,
}) => {
    const style = { marginLeft: '5px' };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {isMultiSort && (
                <Tag minimal style={style}>
                    {sortIndex + 1}
                </Tag>
            )}
            {sort.descending ? (
                <Icon
                    style={style}
                    icon={
                        !isNumeric
                            ? 'sort-alphabetical-desc'
                            : 'sort-numerical-desc'
                    }
                />
            ) : (
                <Icon
                    style={style}
                    icon={!isNumeric ? 'sort-alphabetical' : 'sort-numerical'}
                />
            )}
        </div>
    );
};

const ResultsTable: FC<Props> = ({
    data,
    columns,
    headerContextMenu,
    headerButton,
    cellContextMenu,
}) => {
    const HeaderContextMenu = headerContextMenu || React.Fragment;
    const HeaderButton = headerButton || React.Fragment;
    const CellContextMenu = cellContextMenu || React.Fragment;
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
                                                                cursor: meta?.onHeaderClick
                                                                    ? 'pointer'
                                                                    : undefined,
                                                            }}
                                                            onClick={
                                                                meta?.onHeaderClick
                                                            }
                                                        >
                                                            <Tooltip2
                                                                fill
                                                                content={
                                                                    meta?.item &&
                                                                    isField(
                                                                        meta?.item,
                                                                    )
                                                                        ? meta
                                                                              .item
                                                                              .description
                                                                        : undefined
                                                                }
                                                                position="top"
                                                            >
                                                                <Draggable
                                                                    key={
                                                                        header.id
                                                                    }
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
                                                                        <HeaderContextMenu
                                                                            header={
                                                                                header
                                                                            }
                                                                        >
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
                                                                                    display:
                                                                                        'flex',
                                                                                    justifyContent:
                                                                                        'space-between',
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
                                                                                {meta?.sort && (
                                                                                    <SortIndicator
                                                                                        {...meta?.sort}
                                                                                    />
                                                                                )}
                                                                                <HeaderButton
                                                                                    header={
                                                                                        header
                                                                                    }
                                                                                />
                                                                            </div>
                                                                        </HeaderContextMenu>
                                                                    )}
                                                                </Draggable>
                                                            </Tooltip2>
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
                                {row.getVisibleCells().map((cell) => {
                                    const meta = cell.column.columnDef
                                        .meta as TableColumn['meta'];
                                    return (
                                        <BodyCell
                                            key={cell.id}
                                            style={{
                                                backgroundColor:
                                                    cell.column.columnDef.id ===
                                                        ROW_NUMBER_COLUMN_ID ||
                                                    rowIndex % 2
                                                        ? undefined
                                                        : Colors.LIGHT_GRAY4,
                                            }}
                                            isNaN={
                                                !meta?.item ||
                                                !isNumericItem(meta.item)
                                            }
                                        >
                                            <CellContextMenu cell={cell}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </CellContextMenu>
                                        </BodyCell>
                                    );
                                })}
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
                                        <HeaderCell
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            style={{
                                                backgroundColor: Colors.WHITE,
                                            }}
                                            isNaN={
                                                !meta?.item ||
                                                !isNumericItem(meta.item)
                                            }
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .footer,
                                                      header.getContext(),
                                                  )}
                                        </HeaderCell>
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
